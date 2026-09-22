import { Logger, type INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import type { Server, ServerOptions } from 'socket.io';

type RedisClient = ReturnType<typeof createClient>;

// node-redis's default reconnectStrategy retries forever with no cap, which
// means a plain createClient().connect() never resolves *or* rejects when
// Redis is unreachable — it just hangs. That defeats the whole point of the
// try/catch fallback in main.ts ("stay single-process if Redis is absent").
// Bound the retries so a genuinely unreachable Redis fails fast instead.
const MAX_RECONNECT_ATTEMPTS = 3;

function boundedReconnectStrategy(retries: number): number | Error {
  if (retries > MAX_RECONNECT_ATTEMPTS) {
    return new Error(
      `Redis unreachable after ${MAX_RECONNECT_ATTEMPTS} attempts`,
    );
  }
  return Math.min(retries * 200, 1000);
}

export interface RedisAdapterConfig {
  url?: string | null;
  host: string;
  port: number;
  password?: string | null;
  database: number;
}

/**
 * Socket.IO adapter backed by Redis pub/sub, so collaboration events reach
 * every backend replica instead of only the one holding the socket.
 *
 * Must be installed with `app.useWebSocketAdapter()` *before* `app.listen()`:
 * Nest builds the io server during init, and `createIOServer` below is the
 * only hook that runs early enough to attach the adapter.
 *
 * Note this shares *broadcasts* only. `ScenarioCollaborationGateway` still
 * keeps presence and per-element locks in process-local Maps, so those remain
 * single-replica until they move to shared storage too.
 */
export class RedisIoAdapter extends IoAdapter {
  private readonly logger = new Logger(RedisIoAdapter.name);
  private adapterConstructor?: ReturnType<typeof createAdapter>;
  private clients: RedisClient[] = [];

  constructor(app: INestApplicationContext) {
    super(app);
  }

  async connect(config: RedisAdapterConfig): Promise<void> {
    const pubClient: RedisClient = config.url
      ? createClient({
          url: config.url,
          socket: { reconnectStrategy: boundedReconnectStrategy },
        })
      : createClient({
          socket: {
            host: config.host,
            port: config.port,
            reconnectStrategy: boundedReconnectStrategy,
          },
          password: config.password ?? undefined,
          database: config.database,
        });

    const subClient: RedisClient = pubClient.duplicate();

    // node-redis emits 'error' on transient drops; without a listener those
    // become unhandled events and take the whole process down.
    pubClient.on('error', (error: unknown) =>
      this.logger.error(`Redis pub client error: ${describeError(error)}`),
    );
    subClient.on('error', (error: unknown) =>
      this.logger.error(`Redis sub client error: ${describeError(error)}`),
    );

    try {
      await Promise.all([pubClient.connect(), subClient.connect()]);
    } catch (error) {
      // Do not leak half-open sockets if only one client connected.
      await Promise.allSettled([pubClient.quit(), subClient.quit()]);
      throw error;
    }

    this.clients = [pubClient, subClient];
    this.adapterConstructor = createAdapter(pubClient, subClient);
  }

  createIOServer(port: number, options?: ServerOptions): Server {
    const server = super.createIOServer(port, options) as Server;
    if (this.adapterConstructor) {
      server.adapter(this.adapterConstructor);
    }
    return server;
  }

  async close(server: Server): Promise<void> {
    await super.close(server);
    await Promise.allSettled(this.clients.map((client) => client.quit()));
    this.clients = [];
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
