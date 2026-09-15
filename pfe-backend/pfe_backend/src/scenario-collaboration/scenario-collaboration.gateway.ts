import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OnEvent } from '@nestjs/event-emitter';
import type { DefaultEventsMap, Server, Socket } from 'socket.io';
import { AuthService } from 'src/auth/auth.service';
import { isApprovedScenarioStatut, StatutScenario } from 'src/common/enums';
import { Scenario } from 'src/scenario/scenario.entity';
import { ScenarioShare } from 'src/scenario-share/scenario-share.entity';

interface CollaborationUser {
  id: number;
  firstName?: string;
  lastName?: string;
  email?: string;
  role?: string;
}

interface ScenarioSocketData {
  user?: CollaborationUser;
  scenarioRooms?: Set<string>;
}

type ScenarioSocket = Socket<
  DefaultEventsMap,
  DefaultEventsMap,
  DefaultEventsMap,
  ScenarioSocketData
>;

interface ScenarioPayload {
  scenarioId?: number | string;
}

interface ScenarioEditPayload extends ScenarioPayload {
  entityType?:
    | 'scenario'
    | 'course'
    | 'branching_scenario'
    | 'module'
    | 'sequence'
    | 'activity'
    | 'quiz'
    | 'comment';
  entityId?: number | string;
  action?: 'create' | 'update' | 'delete' | 'reorder';
  patch?: Record<string, unknown>;
  requestId?: string;
}

interface CursorPayload extends ScenarioPayload {
  elementId?: string;
  elementType?: string;
  activityId?: number | string;
  field?: string;
  position?: {
    x?: number;
    y?: number;
    index?: number;
  };
  selection?: {
    start: number;
    end: number;
  };
}

interface LockPayload extends ScenarioPayload {
  elementId?: string;
  elementType?: string;
}

interface LockInfo {
  scenarioId: string;
  elementId: string;
  elementType?: string;
  socketId: string;
  user: CollaborationUser;
  lockedAt: string;
}

interface ScenarioAccess {
  canView: boolean;
  canEdit: boolean;
}

// Mirrors the CORS_ORIGINS allowlist used for the REST API in main.ts.
// Socket.IO's cors.origin accepts an array of exact-match allowed origins
// directly, so no custom callback is needed here like in main.ts (which
// needs one only to customize the rejection error message).
const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:3000')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

@WebSocketGateway({
  namespace: 'scenario-collaboration',
  cors: {
    origin: allowedOrigins,
    credentials: true,
  },
})
export class ScenarioCollaborationGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(ScenarioCollaborationGateway.name);
  // Locks are process-local collaboration hints, not persisted ownership.
  // Disconnect cleanup below prevents stale locks from blocking other editors.
  private readonly locks = new Map<string, LockInfo>();
  private readonly lockKeysBySocket = new Map<string, Set<string>>();
  private readonly usersByScenario = new Map<
    string,
    Map<string, CollaborationUser>
  >();

  constructor(
    private readonly authService: AuthService,
    @InjectRepository(Scenario)
    private readonly scenarioRepo: Repository<Scenario>,
    @InjectRepository(ScenarioShare)
    private readonly shareRepo: Repository<ScenarioShare>,
  ) {}

  async handleConnection(client: ScenarioSocket): Promise<void> {
    try {
      const token = this.extractToken(client);
      if (!token) {
        throw new WsException('Missing authentication token');
      }

      const user = await this.authService.validateSessionToken(token);
      client.data.user = {
        id: Number(user.id),
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
      };
      client.data.scenarioRooms = new Set<string>();
    } catch (error) {
      client.emit('scenario:error', {
        message:
          error instanceof Error
            ? error.message
            : 'Unable to authenticate socket connection',
      });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: ScenarioSocket): void {
    this.releaseSocketLocks(client);
    this.removeFromScenarioRooms(client);
  }

  /**
   * Fired by ScenarioShareService.revoke() after a share row is deleted.
   * Actively kicks the affected user's socket out of the scenario room —
   * assertScenarioAccess only re-checks on the *next* event, so without this
   * a revoked collaborator would keep receiving edits until their next action.
   */
  @OnEvent('share.revoked')
  async handleShareRevoked(payload: {
    scenarioId: number;
    userId: number;
  }): Promise<void> {
    const scenarioId = String(payload.scenarioId);
    const room = this.roomFor(scenarioId);
    const sockets = await this.server.in(room).fetchSockets();

    for (const socket of sockets) {
      const data = socket.data as ScenarioSocketData;
      if (data.user?.id !== payload.userId) continue;

      socket.emit('scenario:permission-revoked', {
        scenarioId,
        message: 'Your access to this scenario has been revoked.',
      });

      socket.leave(room);
      data.scenarioRooms?.delete(scenarioId);
      this.removePresence(scenarioId, socket as unknown as ScenarioSocket);
      this.server.to(room).emit('scenario:presence', {
        scenarioId,
        action: 'leave',
        socketId: socket.id,
        user: data.user,
        collaborators: this.getCollaborators(scenarioId),
        sentAt: new Date().toISOString(),
      });
    }
  }

  @SubscribeMessage('scenario:join')
  async joinScenario(
    @MessageBody() payload: ScenarioPayload,
    @ConnectedSocket() client: ScenarioSocket,
  ) {
    const { scenarioId, room } = await this.assertScenarioAccess(
      payload,
      client,
      false,
    );

    await client.join(room);
    client.data.scenarioRooms?.add(scenarioId);
    this.addPresence(scenarioId, client);

    const collaborators = this.getCollaborators(scenarioId);
    const locks = this.getScenarioLocks(scenarioId);

    client.emit('scenario:joined', {
      scenarioId,
      collaborators,
      locks,
    });

    client.to(room).emit('scenario:presence', {
      scenarioId,
      action: 'join',
      socketId: client.id,
      user: this.toPublicUser(client),
      collaborators,
      sentAt: new Date().toISOString(),
    });

    return { ok: true, scenarioId, collaborators, locks };
  }

  @SubscribeMessage('scenario:leave')
  async leaveScenario(
    @MessageBody() payload: ScenarioPayload,
    @ConnectedSocket() client: ScenarioSocket,
  ) {
    const scenarioId = this.parseScenarioId(payload?.scenarioId);
    const room = this.roomFor(scenarioId);

    await client.leave(room);
    client.data.scenarioRooms?.delete(scenarioId);
    this.removePresence(scenarioId, client);

    client.to(room).emit('scenario:presence', {
      scenarioId,
      action: 'leave',
      socketId: client.id,
      user: this.toPublicUser(client),
      collaborators: this.getCollaborators(scenarioId),
      sentAt: new Date().toISOString(),
    });

    return { ok: true, scenarioId };
  }

  @SubscribeMessage('scenario:edit')
  async broadcastEdit(
    @MessageBody() payload: ScenarioEditPayload,
    @ConnectedSocket() client: ScenarioSocket,
  ) {
    const { scenarioId, room } = await this.assertScenarioAccess(
      payload,
      client,
      true,
    );

    const event = {
      ...payload,
      scenarioId,
      socketId: client.id,
      user: this.toPublicUser(client),
      sentAt: new Date().toISOString(),
    };

    client.to(room).emit('scenario:edit', event);
    return { ok: true, scenarioId };
  }

  @SubscribeMessage('scenario:cursor')
  async broadcastCursor(
    @MessageBody() payload: CursorPayload,
    @ConnectedSocket() client: ScenarioSocket,
  ) {
    const { scenarioId, room } = await this.assertScenarioAccess(
      payload,
      client,
      false,
    );

    client.to(room).emit('scenario:cursor', {
      ...payload,
      scenarioId,
      socketId: client.id,
      user: this.toPublicUser(client),
      sentAt: new Date().toISOString(),
    });

    return { ok: true, scenarioId };
  }

  @SubscribeMessage('scenario:lock')
  async lockElement(
    @MessageBody() payload: LockPayload,
    @ConnectedSocket() client: ScenarioSocket,
  ) {
    const { scenarioId, room } = await this.assertScenarioAccess(
      payload,
      client,
      true,
    );
    const elementId = this.parseElementId(payload?.elementId);
    const key = this.lockKey(scenarioId, elementId);
    const existingLock = this.locks.get(key);

    if (existingLock && existingLock.socketId !== client.id) {
      client.emit('scenario:lock-denied', existingLock);
      return { ok: false, scenarioId, lock: existingLock };
    }

    const lock: LockInfo = {
      scenarioId,
      elementId,
      elementType: payload.elementType,
      socketId: client.id,
      user: this.toPublicUser(client),
      lockedAt: new Date().toISOString(),
    };

    this.locks.set(key, lock);
    this.rememberSocketLock(client.id, key);
    this.server.to(room).emit('scenario:lock', lock);

    return { ok: true, scenarioId, lock };
  }

  @SubscribeMessage('scenario:unlock')
  async unlockElement(
    @MessageBody() payload: LockPayload,
    @ConnectedSocket() client: ScenarioSocket,
  ) {
    const { scenarioId, room } = await this.assertScenarioAccess(
      payload,
      client,
      true,
    );
    const elementId = this.parseElementId(payload?.elementId);
    const released = this.releaseLock(scenarioId, elementId, client.id);

    if (released) {
      this.server.to(room).emit('scenario:unlock', {
        scenarioId,
        elementId,
        socketId: client.id,
        user: this.toPublicUser(client),
        releasedAt: new Date().toISOString(),
      });
    }

    return { ok: true, scenarioId, released };
  }

  private extractToken(client: ScenarioSocket): string | null {
    // socket.io types Handshake.auth as `{ [key: string]: any }`; narrow to unknown here.
    const authToken = client.handshake.auth?.token as unknown;
    if (typeof authToken === 'string' && authToken.trim()) {
      return this.cleanToken(authToken);
    }

    const queryToken = client.handshake.query?.token;
    if (typeof queryToken === 'string' && queryToken.trim()) {
      return this.cleanToken(queryToken);
    }

    const authorization = client.handshake.headers.authorization;
    if (typeof authorization === 'string' && authorization.trim()) {
      return this.cleanToken(authorization);
    }

    return null;
  }

  private cleanToken(token: string): string {
    return token.replace(/^Bearer\s+/i, '').trim();
  }

  private async assertScenarioAccess(
    payload: ScenarioPayload,
    client: ScenarioSocket,
    requiresEdit: boolean,
  ): Promise<{ scenarioId: string; room: string }> {
    // Socket events repeat HTTP access checks because a connected socket can
    // outlive route-level authorization decisions.
    const user = client.data.user;
    if (!user) throw new WsException('Unauthenticated socket');

    const scenarioId = this.parseScenarioId(payload?.scenarioId);
    const access = await this.getScenarioAccess(scenarioId, user);
    const allowed = requiresEdit ? access.canEdit : access.canView;

    if (!allowed) {
      throw new WsException(
        requiresEdit
          ? 'You need edit access to collaborate on this scenario'
          : 'You need access to join this scenario',
      );
    }

    return { scenarioId, room: this.roomFor(scenarioId) };
  }

  private async getScenarioAccess(
    scenarioId: string,
    user: CollaborationUser,
  ): Promise<ScenarioAccess> {
    const scenario = await this.scenarioRepo.findOne({
      where: { id: Number(scenarioId) },
      relations: ['user'],
    });

    if (!scenario) {
      return { canView: false, canEdit: false };
    }

    if (scenario.user?.id === user.id) {
      return { canView: true, canEdit: true };
    }

    const share = await this.shareRepo.findOne({
      where: {
        scenario: { id: Number(scenarioId) },
        sharedWith: { id: user.id },
      },
    });

    if (share) {
      if (isApprovedScenarioStatut(scenario.statut)) {
        return { canView: true, canEdit: false };
      }

      return {
        canView: true,
        canEdit:
          share.permission === 'edit' ||
          share.canEditContent === true ||
          share.canEditStructure === true,
      };
    }

    if (user.role?.toLowerCase() === 'admin') {
      if (scenario.statut === StatutScenario.BROUILLON) {
        return { canView: false, canEdit: false };
      }
      return { canView: true, canEdit: false };
    }

    return { canView: false, canEdit: false };
  }

  private parseScenarioId(value: number | string | undefined): string {
    const numericId =
      typeof value === 'number'
        ? value
        : typeof value === 'string'
          ? Number(value)
          : Number.NaN;

    if (!Number.isInteger(numericId) || numericId <= 0) {
      throw new WsException('A valid scenarioId is required');
    }

    return String(numericId);
  }

  private parseElementId(value: string | undefined): string {
    if (!value?.trim()) {
      throw new WsException('A valid elementId is required');
    }
    return value.trim();
  }

  private roomFor(scenarioId: string): string {
    return `scenario:${scenarioId}`;
  }

  private lockKey(scenarioId: string, elementId: string): string {
    return `${scenarioId}:${elementId}`;
  }

  private toPublicUser(client: ScenarioSocket): CollaborationUser {
    const user = client.data.user;
    if (!user) throw new WsException('Unauthenticated socket');
    return {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
    };
  }

  private addPresence(scenarioId: string, client: ScenarioSocket): void {
    const user = this.toPublicUser(client);
    const users =
      this.usersByScenario.get(scenarioId) ??
      new Map<string, CollaborationUser>();

    users.set(client.id, user);
    this.usersByScenario.set(scenarioId, users);
  }

  private removePresence(scenarioId: string, client: ScenarioSocket): void {
    const users = this.usersByScenario.get(scenarioId);
    if (!users) return;

    users.delete(client.id);
    if (users.size === 0) {
      this.usersByScenario.delete(scenarioId);
    }
  }

  private getCollaborators(scenarioId: string): CollaborationUser[] {
    return Array.from(this.usersByScenario.get(scenarioId)?.values() ?? []);
  }

  private getScenarioLocks(scenarioId: string): LockInfo[] {
    return Array.from(this.locks.values()).filter(
      (lock) => lock.scenarioId === scenarioId,
    );
  }

  private rememberSocketLock(socketId: string, key: string): void {
    const keys = this.lockKeysBySocket.get(socketId) ?? new Set<string>();
    keys.add(key);
    this.lockKeysBySocket.set(socketId, keys);
  }

  private releaseLock(
    scenarioId: string,
    elementId: string,
    socketId: string,
  ): boolean {
    const key = this.lockKey(scenarioId, elementId);
    const lock = this.locks.get(key);

    if (!lock || lock.socketId !== socketId) {
      return false;
    }

    this.locks.delete(key);
    const socketLocks = this.lockKeysBySocket.get(socketId);
    socketLocks?.delete(key);
    if (socketLocks?.size === 0) {
      this.lockKeysBySocket.delete(socketId);
    }

    return true;
  }

  private releaseSocketLocks(client: ScenarioSocket): void {
    const keys = this.lockKeysBySocket.get(client.id);
    if (!keys) return;

    for (const key of keys) {
      const lock = this.locks.get(key);
      if (!lock) continue;

      this.locks.delete(key);
      this.server.to(this.roomFor(lock.scenarioId)).emit('scenario:unlock', {
        scenarioId: lock.scenarioId,
        elementId: lock.elementId,
        socketId: client.id,
        user: lock.user,
        releasedAt: new Date().toISOString(),
      });
    }

    this.lockKeysBySocket.delete(client.id);
  }

  private removeFromScenarioRooms(client: ScenarioSocket): void {
    const scenarioRooms = client.data.scenarioRooms;
    if (!scenarioRooms) return;

    for (const scenarioId of scenarioRooms) {
      this.removePresence(scenarioId, client);
      this.server.to(this.roomFor(scenarioId)).emit('scenario:presence', {
        scenarioId,
        action: 'leave',
        socketId: client.id,
        user: client.data.user,
        collaborators: this.getCollaborators(scenarioId),
        sentAt: new Date().toISOString(),
      });
    }

    scenarioRooms.clear();
    this.logger.debug(`Socket ${client.id} left all scenario rooms`);
  }
}
