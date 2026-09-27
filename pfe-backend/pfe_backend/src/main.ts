import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import type { Request } from 'express';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WinstonModule } from 'nest-winston';
import * as winston from 'winston';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { RedisIoAdapter } from './scenario-collaboration/redis-io.adapter';

const isProduction = process.env.NODE_ENV === 'production';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: WinstonModule.createLogger({
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.timestamp(),
            isProduction
              ? winston.format.json()
              : winston.format.colorize({ all: true }),
            winston.format.simple(),
          ),
        }),
      ],
    }),
  });
  const uploadDir = join(process.cwd(), 'uploads');

  if (!existsSync(uploadDir)) {
    mkdirSync(uploadDir, { recursive: true });
  }

  // Global validation pipe — enforces all DTO class-validator decorators
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // Global exception filter — unified error response format
  app.useGlobalFilters(new AllExceptionsFilter());

  // Serve uploaded files statically at /uploads/<filename>
  app.useStaticAssets(uploadDir, {
    prefix: '/uploads',
  });

  const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  // Browsers attach an Origin header to same-origin POST/PUT/PATCH/DELETE
  // requests too, not only to cross-origin ones. Behind nginx the frontend and
  // /api share one origin, and on a Cloudflare quick tunnel that origin is a
  // *.trycloudflare.com hostname that changes on every restart, so it can never
  // be listed in CORS_ORIGINS (and '*' there is compared literally, it is not a
  // wildcard). An Origin whose host equals the request's own Host header is
  // same-origin by definition, so let it through and keep the CORS_ORIGINS
  // allow-list for genuinely cross-origin callers.
  const isSameOrigin = (origin: string, host: string | undefined): boolean => {
    if (!host) return false;
    try {
      return new URL(origin).host === host;
    } catch {
      return false;
    }
  };

  app.enableCors((req: Request, callback) => {
    const origin = req.headers.origin;

    if (
      !origin ||
      allowedOrigins.includes(origin) ||
      isSameOrigin(origin, req.headers.host)
    ) {
      callback(null, {
        origin: true,
        methods: 'GET,PUT,PATCH,POST,DELETE',
        allowedHeaders: 'Content-Type, Accept, Authorization',
        credentials: true,
      });
    } else {
      callback(new Error(`Origin ${origin} not allowed by CORS`), {});
    }
  });

  const config = new DocumentBuilder()
    .setTitle('PFE App – Plateforme de Scénarisation Pédagogique')
    .setDescription('API REST complète pour la plateforme PFE')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Enter JWT bearer token',
        in: 'header',
      },
      'access-token',
    )
    .build();

  const documentFactory = () => SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, documentFactory);

  const configService = app.get(ConfigService);
  const host = configService.get<string>('server.host', '127.0.0.1');
  const port = configService.get<number>('server.port', 3001);

  // Share Socket.IO events across replicas through Redis. Opt-in: without
  // REDIS_URL / REDIS_HOST the gateway stays single-process, which is the
  // right default for local development.
  if (configService.get<boolean>('redis.enabled', false)) {
    const redisUrl = configService.get<string>('redis.url') || null;
    const redisHost = configService.get<string>('redis.host', 'localhost');
    const redisPort = configService.get<number>('redis.port', 6379);
    const target = redisUrl ?? `${redisHost}:${redisPort}`;
    const redisAdapter = new RedisIoAdapter(app);

    try {
      await redisAdapter.connect({
        url: redisUrl,
        host: redisHost,
        port: redisPort,
        password: configService.get<string>('redis.password') || null,
        database: configService.get<number>('redis.db', 0),
      });
      // Must precede app.listen(): Nest builds the io server during init.
      app.useWebSocketAdapter(redisAdapter);
      console.log(`Socket.IO Redis adapter connected to ${target}`);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      // In production a missing adapter silently breaks cross-replica
      // collaboration, so fail loudly instead of degrading.
      if (isProduction) {
        throw new Error(
          `Redis adapter connection to ${target} failed: ${reason}`,
        );
      }
      console.warn(
        `Redis adapter unavailable (${reason}) — continuing with in-process Socket.IO`,
      );
    }
  }

  app.enableShutdownHooks();

  await app.listen(port, host);
  console.log(`Server running on http://${host}:${port}`);
  console.log(`Swagger docs at http://${host}:${port}/api`);
}
// eslint-disable-next-line @typescript-eslint/no-floating-promises
bootstrap();
