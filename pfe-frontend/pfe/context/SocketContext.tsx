'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import { io, type Socket } from 'socket.io-client'
import { useAuth } from '@/context/AuthContext'

const SOCKET_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

export interface CollaborationUser {
  id: number | string
  firstName?: string
  lastName?: string
  email?: string
  role?: string
}

export interface ScenarioEditEvent {
  scenarioId: string
  entityType?: 'scenario' | 'course' | 'branching_scenario' | 'module' | 'sequence' | 'activity' | 'quiz' | 'comment'
  entityId?: number | string
  action?: 'create' | 'update' | 'delete' | 'reorder'
  patch?: Record<string, unknown>
  requestId?: string
  socketId?: string
  user?: CollaborationUser
  sentAt?: string
}

export interface ScenarioCursorEvent {
  scenarioId: string
  elementId?: string
  elementType?: string
  activityId?: number | string
  field?: string
  position?: {
    x?: number
    y?: number
    index?: number
  }
  selection?: {
    start: number
    end: number
  }
  socketId?: string
  user?: CollaborationUser
  sentAt?: string
}

export interface ScenarioLockInfo {
  scenarioId: string
  elementId: string
  elementType?: string
  socketId: string
  user: CollaborationUser
  lockedAt: string
}

interface JoinPayload {
  scenarioId: string
  collaborators?: CollaborationUser[]
  locks?: ScenarioLockInfo[]
}

interface PresencePayload {
  scenarioId: string
  action: 'join' | 'leave'
  socketId?: string
  user?: CollaborationUser
  collaborators?: CollaborationUser[]
  sentAt?: string
}

interface UnlockPayload {
  scenarioId: string
  elementId: string
  socketId?: string
  user?: CollaborationUser
  releasedAt?: string
}

interface SocketContextValue {
  socket: Socket | null
  isConnected: boolean
  joinScenario: (scenarioId: string) => void
  leaveScenario: (scenarioId: string) => void
  broadcastScenarioEdit: (payload: Omit<ScenarioEditEvent, 'sentAt'>) => void
  broadcastCursor: (payload: Omit<ScenarioCursorEvent, 'sentAt'>) => void
  lockElement: (payload: { scenarioId: string; elementId: string; elementType?: string }) => void
  unlockElement: (payload: { scenarioId: string; elementId: string; elementType?: string }) => void
}

interface ScenarioRoomContextValue {
  scenarioId?: string
  collaborators: CollaborationUser[]
  locks: ScenarioLockInfo[]
  lastEdit: ScenarioEditEvent | null
  joinScenario: (scenarioId: string) => void
  leaveScenario: (scenarioId: string) => void
  broadcastScenarioEdit: (payload: Omit<ScenarioEditEvent, 'sentAt'>) => void
  broadcastCursor: (payload: Omit<ScenarioCursorEvent, 'sentAt'>) => void
  lockElement: (payload: { scenarioId: string; elementId: string; elementType?: string }) => void
  unlockElement: (payload: { scenarioId: string; elementId: string; elementType?: string }) => void
  isConnected: boolean
}

export type {
  JoinPayload as ScenarioJoinedPayload,
  PresencePayload as ScenarioPresencePayload,
  UnlockPayload as ScenarioUnlockPayload,
}

const SocketContext = createContext<SocketContextValue | null>(null)
const ScenarioRoomContext = createContext<ScenarioRoomContextValue | null>(null)

export function SocketProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth()
  const socket = useMemo(() => {
    if (!token) return null
    // Recreate the connection only when the JWT changes so server-side socket
    // auth, presence, and lock cleanup all follow the same session boundary.
    return io(`${SOCKET_URL}/scenario-collaboration`, {
      auth: { token },
      autoConnect: false,
      withCredentials: true,
      transports: ['websocket', 'polling'],
    })
  }, [token])

  const subscribeConnection = useCallback(
    (listener: () => void) => {
      if (!socket) return () => undefined
      // Socket.IO connection state is external to React; these events are the
      // minimal subscription surface needed by useSyncExternalStore.
      socket.on('connect', listener)
      socket.on('disconnect', listener)
      return () => {
        socket.off('connect', listener)
        socket.off('disconnect', listener)
      }
    },
    [socket],
  )

  const getConnectionSnapshot = useCallback(() => socket?.connected ?? false, [socket])
  const isConnected = useSyncExternalStore(
    subscribeConnection,
    getConnectionSnapshot,
    () => false,
  )

  useEffect(() => {
    if (!socket) return
    socket.connect()
    return () => {
      socket.disconnect()
    }
  }, [socket])

  const joinScenario = useCallback(
    (scenarioId: string) => {
      socket?.emit('scenario:join', { scenarioId })
    },
    [socket],
  )

  const leaveScenario = useCallback(
    (scenarioId: string) => {
      socket?.emit('scenario:leave', { scenarioId })
    },
    [socket],
  )

  const broadcastScenarioEdit = useCallback(
    (payload: Omit<ScenarioEditEvent, 'sentAt'>) => {
      socket?.emit('scenario:edit', payload)
    },
    [socket],
  )

  const broadcastCursor = useCallback(
    (payload: Omit<ScenarioCursorEvent, 'sentAt'>) => {
      socket?.emit('scenario:cursor', payload)
    },
    [socket],
  )

  const lockElement = useCallback(
    (payload: { scenarioId: string; elementId: string; elementType?: string }) => {
      socket?.emit('scenario:lock', payload)
    },
    [socket],
  )

  const unlockElement = useCallback(
    (payload: { scenarioId: string; elementId: string; elementType?: string }) => {
      socket?.emit('scenario:unlock', payload)
    },
    [socket],
  )

  const value = useMemo<SocketContextValue>(
    () => ({
      socket,
      isConnected,
      joinScenario,
      leaveScenario,
      broadcastScenarioEdit,
      broadcastCursor,
      lockElement,
      unlockElement,
    }),
    [
      socket,
      isConnected,
      joinScenario,
      leaveScenario,
      broadcastScenarioEdit,
      broadcastCursor,
      lockElement,
      unlockElement,
    ],
  )

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>
}

export function ScenarioRoomProvider({
  scenarioId,
  children,
}: {
  scenarioId?: string
  children: ReactNode
}) {
  const { socket, isConnected, joinScenario, leaveScenario, broadcastScenarioEdit, broadcastCursor, lockElement, unlockElement } = useSocket()
  const [collaborators, setCollaborators] = useState<CollaborationUser[]>([])
  const [locks, setLocks] = useState<ScenarioLockInfo[]>([])
  const [lastEdit, setLastEdit] = useState<ScenarioEditEvent | null>(null)

  useEffect(() => {
    if (!socket || !scenarioId || !isConnected) {
      return
    }

    const roomId = String(scenarioId)

    const handleJoined = (payload: JoinPayload) => {
      if (String(payload.scenarioId) !== roomId) return
      setCollaborators(payload.collaborators ?? [])
      setLocks(payload.locks ?? [])
    }

    const handlePresence = (payload: PresencePayload) => {
      if (String(payload.scenarioId) !== roomId) return
      if (payload.collaborators) {
        setCollaborators(payload.collaborators)
      }
    }

    const handleLock = (payload: ScenarioLockInfo) => {
      if (String(payload.scenarioId) !== roomId) return
      setLocks((current) => {
        const next = current.filter((item) => item.elementId !== payload.elementId)
        return [...next, payload]
      })
    }

    const handleUnlock = (payload: UnlockPayload) => {
      if (String(payload.scenarioId) !== roomId) return
      setLocks((current) => current.filter((item) => item.elementId !== payload.elementId))
    }

    const handleEdit = (payload: ScenarioEditEvent) => {
      if (String(payload.scenarioId) !== roomId) return
      setLastEdit(payload)
    }

    socket.on('scenario:joined', handleJoined)
    socket.on('scenario:presence', handlePresence)
    socket.on('scenario:lock', handleLock)
    socket.on('scenario:unlock', handleUnlock)
    socket.on('scenario:edit', handleEdit)

    joinScenario(roomId)

    return () => {
      leaveScenario(roomId)
      socket.off('scenario:joined', handleJoined)
      socket.off('scenario:presence', handlePresence)
      socket.off('scenario:lock', handleLock)
      socket.off('scenario:unlock', handleUnlock)
      socket.off('scenario:edit', handleEdit)
    }
  }, [isConnected, joinScenario, leaveScenario, scenarioId, socket])

  const value = useMemo<ScenarioRoomContextValue>(
    () => ({
      scenarioId,
      collaborators,
      locks,
      lastEdit,
      joinScenario,
      leaveScenario,
      broadcastScenarioEdit,
      broadcastCursor,
      lockElement,
      unlockElement,
      isConnected,
    }),
    [
      scenarioId,
      collaborators,
      locks,
      lastEdit,
      joinScenario,
      leaveScenario,
      broadcastScenarioEdit,
      broadcastCursor,
      lockElement,
      unlockElement,
      isConnected,
    ],
  )

  return <ScenarioRoomContext.Provider value={value}>{children}</ScenarioRoomContext.Provider>
}

export function useScenarioRoom() {
  const ctx = useContext(ScenarioRoomContext)
  if (!ctx) return {
    scenarioId: undefined,
    collaborators: [],
    locks: [],
    lastEdit: null,
    joinScenario: () => undefined,
    leaveScenario: () => undefined,
    broadcastScenarioEdit: () => undefined,
    broadcastCursor: () => undefined,
    lockElement: () => undefined,
    unlockElement: () => undefined,
    isConnected: false,
  } satisfies ScenarioRoomContextValue
  return ctx
}

export function useSocket() {
  const ctx = useContext(SocketContext)
  if (!ctx) throw new Error('useSocket must be used within SocketProvider')
  return ctx
}
