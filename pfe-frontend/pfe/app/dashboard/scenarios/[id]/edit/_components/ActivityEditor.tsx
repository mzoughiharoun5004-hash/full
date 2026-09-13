'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import { Lock, MousePointer2, Save, Video, FileText, Link2, File, HelpCircle, Library } from 'lucide-react'
import { scenariosApi } from '@/lib/api'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useAuth } from '@/context/AuthContext'
import { useSocket, type ScenarioCursorEvent, type ScenarioLockInfo } from '@/context/SocketContext'
import { cn } from '@/lib/utils'
import { MediaPicker } from './MediaPicker'
import type { Activity, ActivityType, MediaAsset, MediaType } from '@/types'

interface Props {
  scenarioId: string
  moduleId: string
  sequenceId: string
  activity: Activity
  lock?: ScenarioLockInfo
  remoteCursors?: ScenarioCursorEvent[]
}

const typeConfig: Record<ActivityType, { icon: React.ElementType; label: string; color: string }> = {
  VIDEO:  { icon: Video,      label: 'Video',    color: 'text-[#83BFA1]' },
  TEXT:   { icon: FileText,   label: 'Text',     color: 'text-[#83BFA1]'    },
  QUIZ:   { icon: HelpCircle, label: 'Quiz',     color: 'text-amber-400'  },
  FILE:   { icon: File,       label: 'File',     color: 'text-green-400'  },
  LINK:   { icon: Link2,      label: 'Link',     color: 'text-rose-400'   },
}

export function ActivityEditor({ scenarioId, moduleId, sequenceId, activity, lock, remoteCursors = [] }: Props) {
  const qc = useQueryClient()
  const { user } = useAuth()
  const { broadcastScenarioEdit, broadcastCursor, lockElement, unlockElement } = useSocket()
  const [title, setTitle]     = useState(activity.title)
  const [content, setContent] = useState(activity.content ?? '')
  const [type, setType]       = useState<ActivityType>(activity.type)
  const [points, setPoints]   = useState(String(activity.points ?? ''))
  const [duration, setDuration] = useState(String(activity.duration ?? ''))
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false)
  const claimedLock = useRef(false)
  const elementId = useMemo(() => `activity:${activity.id}`, [activity.id])
  const lockedByOther = !!lock && String(lock.user.id) !== String(user?.id)
  const lockerName = [lock?.user.firstName, lock?.user.lastName].filter(Boolean).join(' ') || lock?.user.email || 'Another collaborator'

  useEffect(() => {
    if (!lockedByOther && !claimedLock.current) {
      claimedLock.current = true
      lockElement({ scenarioId, elementId, elementType: 'activity' })
    }

    return () => {
      if (claimedLock.current) {
        unlockElement({ scenarioId, elementId, elementType: 'activity' })
        claimedLock.current = false
      }
    }
  }, [elementId, lockElement, lockedByOther, scenarioId, unlockElement])

  const { mutate: save, isPending } = useMutation({
    mutationFn: () =>
      scenariosApi.updateActivity(scenarioId, moduleId, sequenceId, activity.id, {
        title,
        type,
        content,
        points: points ? Number(points) : undefined,
        duration: duration ? Number(duration) : undefined,
      }),
    onSuccess: () => {
      toast.success('Activity saved')
      qc.invalidateQueries({ queryKey: ['scenario', scenarioId] })
      broadcastScenarioEdit({
        scenarioId,
        entityType: 'activity',
        entityId: activity.id,
        action: 'update',
        patch: { title, type, content },
      })
    },
    onError: () => toast.error('Failed to save activity'),
  })

  const TypeIcon = typeConfig[type]?.icon ?? FileText
  const mediaTypes: MediaType[] =
    type === 'VIDEO'
      ? ['VIDEO']
      : type === 'FILE'
        ? ['DOCUMENT', 'IMAGE', 'AUDIO', 'VIDEO']
        : []

  const handleMediaSelect = (asset: MediaAsset) => {
    claimLock()
    setContent(asset.url)
  }

  const claimLock = () => {
    if (claimedLock.current || lockedByOther) return
    claimedLock.current = true
    lockElement({ scenarioId, elementId, elementType: 'activity' })
  }

  const handleCursor = (field: string) => {
    claimLock()
    broadcastCursor({
      scenarioId,
      elementId,
      elementType: 'activity',
      activityId: activity.id,
      field,
    })
  }

  const clearCursor = () => {
    broadcastCursor({
      scenarioId,
      elementId,
      elementType: 'activity',
      activityId: activity.id,
    })
  }

  const cursorLabel = remoteCursors
    .map(cursor => {
      const name = [cursor.user?.firstName, cursor.user?.lastName].filter(Boolean).join(' ') || cursor.user?.email || 'Someone'
      return cursor.field ? `${name}: ${cursor.field}` : null
    })
    .filter(Boolean)
    .join(', ')

  return (
    <div className="flex flex-col h-full overflow-y-auto lux-scrollbar">
      {lockedByOther && (
        <div className="flex items-center gap-2 border-b border-amber-400/20 bg-amber-400/10 px-4 py-2 text-xs text-amber-200">
          <Lock size={13} />
          <span>{lockerName} is editing this activity.</span>
        </div>
      )}
      {!lockedByOther && cursorLabel && (
        <div className="flex items-center gap-2 border-b border-[#0F6B4A]/25 bg-[#0F6B4A]/10 px-4 py-2 text-xs text-[#83BFA1]">
          <MousePointer2 size={13} />
          <span>{cursorLabel}</span>
        </div>
      )}

      {/* Type selector */}
      <div className="flex gap-1 p-3 border-b border-white/7">
        {(Object.entries(typeConfig) as [ActivityType, typeof typeConfig[ActivityType]][]).map(([t, cfg]) => {
          const Icon = cfg.icon
          return (
            <button
              key={t}
              onClick={() => {
                claimLock()
                setType(t)
              }}
              disabled={lockedByOther}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all border',
                type === t
                  ? 'border-[#0F6B4A]/50 bg-[#0F6B4A]/18 text-[#83BFA1]'
                  : 'border-transparent text-slate-500 hover:text-slate-300 hover:bg-white/5',
                lockedByOther && 'cursor-not-allowed opacity-50'
              )}
            >
              <Icon size={11} className={type === t ? cfg.color : ''} />
              {cfg.label}
            </button>
          )
        })}
      </div>

      {/* Form */}
      <div className="flex-1 p-4 space-y-4">
        <Input
          id="act-title"
          label="Activity title"
          value={title}
          onChange={e => setTitle(e.target.value)}
          onFocus={() => handleCursor('title')}
          onBlur={clearCursor}
          disabled={lockedByOther}
          icon={<TypeIcon size={13} className={typeConfig[type]?.color} />}
        />

        <div className="grid grid-cols-2 gap-3">
          <Input
            id="act-points"
            label="Points"
            type="number"
            min={0}
            placeholder="0"
            value={points}
            onChange={e => setPoints(e.target.value)}
            onFocus={() => handleCursor('points')}
            onBlur={clearCursor}
            disabled={lockedByOther}
          />
          <Input
            id="act-duration"
            label="Duration (min)"
            type="number"
            min={1}
            placeholder="—"
            value={duration}
            onChange={e => setDuration(e.target.value)}
            onFocus={() => handleCursor('duration')}
            onBlur={clearCursor}
            disabled={lockedByOther}
          />
        </div>

        {/* Content area varies by type */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-slate-300">
            {type === 'VIDEO' ? 'Video URL' : type === 'LINK' ? 'URL' : 'Content'}
          </label>
          {type === 'TEXT' ? (
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              onFocus={() => handleCursor('content')}
              onBlur={clearCursor}
              disabled={lockedByOther}
              rows={10}
              placeholder="Write your content here…"
              className="w-full bg-white/5 border border-white/10 rounded-xl text-slate-100 text-sm px-4 py-3 resize-none placeholder:text-slate-600 focus:outline-none focus:border-[#0F6B4A] focus:ring-2 focus:ring-[#0F6B4A]/25 transition-all"
            />
          ) : type === 'QUIZ' ? (
            <div className="rounded-xl border border-white/10 bg-white/3 p-4 text-center text-sm text-slate-500">
              Configure quiz questions in the <span className="text-amber-400 font-medium">Quiz</span> tab above.
            </div>
          ) : type === 'VIDEO' || type === 'FILE' ? (
            <div className="flex gap-2">
              <div className="min-w-0 flex-1">
                <Input
                  id="act-content"
                  placeholder={type === 'VIDEO' ? 'Video URL or uploaded file path' : 'File URL or uploaded file path'}
                  value={content}
                  onChange={e => setContent(e.target.value)}
                  onFocus={() => handleCursor('content')}
                  onBlur={clearCursor}
                  disabled={lockedByOther}
                  icon={type === 'VIDEO' ? <Video size={13} /> : <File size={13} />}
                />
              </div>
              <div className="pt-6">
                <Button size="sm" variant="secondary" onClick={() => setMediaPickerOpen(true)} disabled={lockedByOther}>
                  <Library size={13} className="mr-1" /> Library
                </Button>
              </div>
            </div>
          ) : (
            <Input
              id="act-content"
              placeholder="https://..."
              value={content}
              onChange={e => setContent(e.target.value)}
              onFocus={() => handleCursor('content')}
              onBlur={clearCursor}
              disabled={lockedByOther}
              icon={<Link2 size={13} />}
            />
          )}
        </div>
      </div>

      {/* Save bar */}
      <div className="border-t border-white/7 p-3 flex justify-end bg-[#0d0f17]">
        <Button size="sm" onClick={() => save()} loading={isPending} disabled={lockedByOther}>
          <Save size={13} className="mr-1" /> Save activity
        </Button>
      </div>

      {mediaPickerOpen && mediaTypes.length > 0 && (
        <MediaPicker
          open={mediaPickerOpen}
          onClose={() => setMediaPickerOpen(false)}
          acceptedTypes={mediaTypes}
          onSelect={handleMediaSelect}
        />
      )}
    </div>
  )
}
