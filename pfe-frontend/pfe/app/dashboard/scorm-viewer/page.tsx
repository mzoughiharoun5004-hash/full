'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import {
  Copy,
  ExternalLink,
  FileArchive,
  FileCheck2,
  Loader2,
  Maximize2,
  Minimize2,
  MonitorPlay,
  RotateCcw,
  Trash2,
  Upload,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardBody } from '@/components/ui/Card'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { Badge } from '@/components/ui/Badge'
import { getApiErrorMessage, scormApi } from '@/lib/api'
import { useTranslation } from '@/context/LanguageContext'
import { cn, formatBytes, formatDate } from '@/lib/utils'
import type { UploadedScormPackage } from '@/types'
import type { TranslationKey } from '@/lib/translations'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
const MAX_SCORM_UPLOAD_SIZE = 250 * 1024 * 1024
const STORAGE_KEY = 'scorm-viewer:last-package-id'

function absoluteApiUrl(path: string) {
  return path.startsWith('http') ? path : `${API_URL}${path}`
}

type TrackingTone = 'default' | 'info' | 'success' | 'warning' | 'danger'

interface TrackingState {
  status: string
  successStatus: string
  scoreRaw: string
  scoreMax: string
}

const TRACKING_META: Record<string, { labelKey: TranslationKey; variant: TrackingTone; pulse?: boolean }> = {
  'not attempted': { labelKey: 'scorm_status_not_started', variant: 'default' },
  unknown: { labelKey: 'scorm_status_not_started', variant: 'default' },
  browsed: { labelKey: 'scorm_status_browsed', variant: 'warning' },
  incomplete: { labelKey: 'scorm_status_in_progress', variant: 'info', pulse: true },
  completed: { labelKey: 'scorm_status_completed', variant: 'success', pulse: true },
  passed: { labelKey: 'scorm_status_passed', variant: 'success', pulse: true },
  failed: { labelKey: 'scorm_status_failed', variant: 'danger' },
}

function resolveTrackingMeta(tracking: TrackingState | null) {
  if (!tracking) return TRACKING_META['not attempted']
  const success = tracking.successStatus.toLowerCase()
  const effective = success === 'passed' ? 'passed' : success === 'failed' ? 'failed' : tracking.status.toLowerCase()
  return TRACKING_META[effective] ?? TRACKING_META['not attempted']
}

function getInitialRestoring(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return Boolean(window.localStorage.getItem(STORAGE_KEY))
  } catch {
    return false
  }
}

export default function ScormViewerPage() {
  const { t } = useTranslation()
  const fileRef = useRef<HTMLInputElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [packageInfo, setPackageInfo] = useState<UploadedScormPackage | null>(null)
  const [viewerKey, setViewerKey] = useState(0)
  const [restoring, setRestoring] = useState(getInitialRestoring)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [tracking, setTracking] = useState<TrackingState | null>(null)

  const viewerUrl = useMemo(
    () => (packageInfo ? absoluteApiUrl(packageInfo.viewUrl) : ''),
    [packageInfo],
  )

  const validateScormFile = (file: File): string | null => {
    if (!file.name.toLowerCase().endsWith('.zip')) {
      return t('scorm_validation_zip')
    }
    if (file.size > MAX_SCORM_UPLOAD_SIZE) {
      return t('scorm_validation_size')
    }
    return null
  }

  const { mutate: uploadScorm, isPending: uploading } = useMutation({
    mutationFn: (file: File) => scormApi.upload(file),
    onSuccess: (response) => {
      const data = response.data as UploadedScormPackage
      setPackageInfo(data)
      setViewerKey((current) => current + 1)
      setTracking(null)
      try {
        window.localStorage.setItem(STORAGE_KEY, data.id)
      } catch {}
      toast.success(t('scorm_uploaded_success'))
    },
    onError: (error) => toast.error(getApiErrorMessage(error, t('media_upload_failed'))),
  })

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const data = event.data
      if (!data || typeof data !== 'object') return
      if (data.type === 'SCORM_TRACKING_UPDATE' && data.payload) {
        setTracking(data.payload as TrackingState)
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement))
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  useEffect(() => {
    let active = true
    const restoreLastPackage = async () => {
      if (typeof window === 'undefined') return
      let savedId: string | null = null
      try {
        savedId = window.localStorage.getItem(STORAGE_KEY)
      } catch {}
      if (!savedId) {
        if (active) setRestoring(false)
        return
      }
      try {
        const response = await scormApi.getUploaded(savedId)
        if (active && response.data) {
          setPackageInfo(response.data as UploadedScormPackage)
          setViewerKey((current) => current + 1)
        }
      } catch {
        try {
          window.localStorage.removeItem(STORAGE_KEY)
        } catch {}
      } finally {
        if (active) setRestoring(false)
      }
    }
    void restoreLastPackage()
    return () => { active = false }
  }, [])

  const handleFile = (file?: File | null) => {
    if (!file || uploading) return
    const error = validateScormFile(file)
    if (error) {
      toast.error(error)
      return
    }
    uploadScorm(file)
  }

  const handleClear = () => {
    if (uploading) return
    if (document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(() => {})
    }
    setPackageInfo(null)
    setTracking(null)
    setIsFullscreen(false)
    try {
      window.localStorage.removeItem(STORAGE_KEY)
    } catch {}
  }

  const handleCopyLaunchUrl = async () => {
    if (!viewerUrl) return
    try {
      await navigator.clipboard.writeText(viewerUrl)
      toast.success(t('scorm_launch_copied'))
    } catch {
      toast.error(t('scorm_launch_copy_failed'))
    }
  }

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      if (document.exitFullscreen) document.exitFullscreen().catch(() => {})
      return
    }
    const el = previewRef.current
    if (!el?.requestFullscreen) {
      toast.error(t('scorm_fullscreen_unavailable'))
      return
    }
    el.requestFullscreen().catch(() => {
      toast.error(t('scorm_fullscreen_unavailable'))
    })
  }

  const trackingMeta = resolveTrackingMeta(tracking)
  const trackingScoreLabel = tracking?.scoreRaw
    ? t('scorm_score_reported', { raw: tracking.scoreRaw, max: tracking.scoreMax ? ` / ${tracking.scoreMax}` : '' })
    : t('scorm_score_none')

  return (
    <div className="flex min-h-[calc(100vh-8rem)] flex-col gap-5 fade-up">
      <PageHeader
        eyebrow={t('scorm_eyebrow')}
        title={t('scorm_title')}
        description={t('scorm_desc')}
        actions={
          <>
            {packageInfo && (
              <>
                <Button type="button" size="sm" variant="ghost" onClick={handleClear} disabled={uploading}>
                  <Trash2 size={14} /> {t('scorm_clear')}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => setViewerKey((current) => current + 1)}
                >
                  <RotateCcw size={14} /> {t('scorm_relaunch')}
                </Button>
                <Button type="button" size="sm" variant="secondary" onClick={handleCopyLaunchUrl}>
                  <Copy size={14} /> {t('scorm_copy_launch')}
                </Button>
              </>
            )}
            {viewerUrl && (
              <a
                href={viewerUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-[var(--lux-line)] bg-transparent px-3 text-xs font-semibold text-[var(--lux-text)] transition-colors hover:border-[var(--lux-line-strong)] hover:bg-[var(--lux-primary-soft)]"
              >
                <ExternalLink size={14} /> {t('scorm_open')}
              </a>
            )}
            <Button type="button" size="sm" onClick={() => fileRef.current?.click()} loading={uploading}>
              <Upload size={14} /> {packageInfo ? t('scorm_replace') : t('scorm_upload_btn')}
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".zip,application/zip,application/x-zip-compressed"
              className="hidden"
              onChange={(event) => {
                handleFile(event.target.files?.[0])
                event.currentTarget.value = ''
              }}
            />
          </>
        }
      />

      <Card className="overflow-hidden">
        <CardBody className="p-0">
          <div
            role="button"
            tabIndex={0}
            aria-label={t('scorm_drop_hint')}
            aria-describedby="scorm-upload-hint"
            aria-disabled={uploading}
            className={cn(
              'grid min-h-[170px] place-items-center border-2 border-dashed p-6 text-center outline-none transition-all',
              'focus-visible:ring-2 focus-visible:ring-[var(--lux-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--lux-bg)]',
              uploading ? 'cursor-not-allowed opacity-70' : 'cursor-pointer',
              isDragging
                ? 'border-[var(--lux-primary)] bg-[var(--lux-primary-soft)]'
                : 'border-[var(--lux-line)] bg-[var(--lux-overlay)] hover:border-[var(--lux-line-strong)] hover:bg-[var(--lux-overlay-hover)]',
            )}
            onClick={() => !uploading && fileRef.current?.click()}
            onKeyDown={(event) => {
              if (uploading) return
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                fileRef.current?.click()
              }
            }}
            onDragOver={(event) => {
              event.preventDefault()
              if (!uploading) setIsDragging(true)
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(event) => {
              event.preventDefault()
              setIsDragging(false)
              handleFile(event.dataTransfer.files?.[0])
            }}
          >
            <div className="flex max-w-xl flex-col items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[var(--lux-primary-soft)] text-[var(--lux-primary-muted)]">
                {uploading ? <Loader2 size={22} className="animate-spin" /> : <FileArchive size={22} />}
              </div>
              <div>
                <p className="text-sm font-semibold text-[var(--lux-text-strong)]">
                  {uploading ? t('scorm_drop_uploading') : t('scorm_drop_idle')}
                </p>
                <p id="scorm-upload-hint" className="mt-1 text-xs text-[var(--lux-muted-soft)]">
                  {t('scorm_drop_hint')}
                </p>
              </div>
            </div>
          </div>
        </CardBody>
      </Card>

      {packageInfo && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--lux-primary-soft)] text-[var(--lux-primary-muted)]">
                <FileCheck2 size={18} />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[var(--lux-text-strong)]">{packageInfo.title}</p>
                <p className="truncate text-xs text-[var(--lux-muted-soft)]">{packageInfo.originalName}</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <p className="text-xs font-medium uppercase text-[var(--lux-muted-soft)]">{t('scorm_meta_launch')}</p>
            <p className="mt-1 truncate text-sm font-semibold text-[var(--lux-text-strong)]">{packageInfo.launchPath}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs font-medium uppercase text-[var(--lux-muted-soft)]">{t('scorm_meta_uploaded')}</p>
            <p className="mt-1 text-sm font-semibold text-[var(--lux-text-strong)]">
              {formatBytes(packageInfo.size)} · {formatDate(packageInfo.uploadedAt)}
            </p>
          </Card>
          <Card className="p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium uppercase text-[var(--lux-muted-soft)]">{t('scorm_meta_status')}</p>
              <Badge variant={trackingMeta.variant} dot pulse={trackingMeta.pulse}>
                {t(trackingMeta.labelKey)}
              </Badge>
            </div>
            <p className="mt-2 truncate text-sm font-semibold text-[var(--lux-text-strong)]">{trackingScoreLabel}</p>
          </Card>
        </div>
      )}

      <div ref={previewRef} className="flex min-h-[560px] flex-1 flex-col">
        <Card className={cn('flex min-h-[560px] flex-1 flex-col overflow-hidden', isFullscreen && 'h-full rounded-none')}>
          {isFullscreen && (
            <div className="flex items-center justify-between border-b border-[var(--lux-line)] bg-[var(--lux-surface)] px-4 py-2">
              <span className="truncate text-xs font-semibold text-[var(--lux-muted)]">
                {packageInfo?.title ?? t('scorm_title')}
              </span>
              <Button type="button" size="sm" variant="ghost" onClick={toggleFullscreen}>
                <Minimize2 size={14} /> {t('scorm_exit_fullscreen')}
              </Button>
            </div>
          )}
          <div className="relative flex-1">
            {viewerUrl && !isFullscreen && (
              <button
                type="button"
                onClick={toggleFullscreen}
                title={t('scorm_fullscreen')}
                aria-label={t('scorm_fullscreen')}
                className="absolute right-3 top-3 z-10 grid h-8 w-8 place-items-center rounded-lg border border-[var(--lux-line)] bg-[var(--lux-surface)]/85 text-[var(--lux-muted)] backdrop-blur transition-colors hover:border-[var(--lux-line-strong)] hover:text-[var(--lux-text-strong)]"
              >
                <Maximize2 size={14} />
              </button>
            )}
            {restoring ? (
              <div className="grid h-[560px] place-items-center p-6 text-center">
                <div className="flex flex-col items-center gap-3">
                  <Loader2 size={22} className="animate-spin text-[var(--lux-muted)]" />
                  <p className="text-xs text-[var(--lux-muted-soft)]">{t('scorm_restoring')}</p>
                </div>
              </div>
            ) : viewerUrl ? (
              <iframe
                key={viewerKey}
                src={viewerUrl}
                title={packageInfo?.title ?? t('scorm_title')}
                className={cn('block w-full border-0 bg-white', isFullscreen ? 'h-full' : 'h-[68vh] min-h-[560px]')}
                allow="fullscreen; autoplay; clipboard-read; clipboard-write"
                allowFullScreen
              />
            ) : (
              <EmptyState
                icon={<MonitorPlay size={22} />}
                title={t('scorm_empty_title')}
                description={t('scorm_empty_desc')}
                action={
                  <Button type="button" size="sm" onClick={() => fileRef.current?.click()}>
                    <Upload size={14} /> {t('scorm_upload_btn')}
                  </Button>
                }
              />
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}
