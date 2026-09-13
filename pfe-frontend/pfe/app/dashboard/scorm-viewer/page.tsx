'use client'

import { useMemo, useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import {
  ExternalLink,
  FileArchive,
  FileCheck2,
  Loader2,
  MonitorPlay,
  RotateCcw,
  Upload,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardBody } from '@/components/ui/Card'
import { PageHeader } from '@/components/ui/PageHeader'
import { getApiErrorMessage, scormApi } from '@/lib/api'
import { cn, formatBytes, formatDate } from '@/lib/utils'
import type { UploadedScormPackage } from '@/types'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
const MAX_SCORM_UPLOAD_SIZE = 250 * 1024 * 1024

function absoluteApiUrl(path: string) {
  return path.startsWith('http') ? path : `${API_URL}${path}`
}

function validateScormFile(file: File): string | null {
  if (!file.name.toLowerCase().endsWith('.zip')) {
    return 'Choose a .zip SCORM package.'
  }
  if (file.size > MAX_SCORM_UPLOAD_SIZE) {
    return 'The SCORM package must be 250 MB or smaller.'
  }
  return null
}

export default function ScormViewerPage() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [packageInfo, setPackageInfo] = useState<UploadedScormPackage | null>(null)
  const [viewerKey, setViewerKey] = useState(0)

  const viewerUrl = useMemo(
    () => (packageInfo ? absoluteApiUrl(packageInfo.viewUrl) : ''),
    [packageInfo],
  )

  const { mutate: uploadScorm, isPending: uploading } = useMutation({
    mutationFn: (file: File) => scormApi.upload(file).then((response) => response.data),
    onSuccess: (data) => {
      setPackageInfo(data)
      setViewerKey((current) => current + 1)
      toast.success('SCORM package loaded')
    },
    onError: (error) => toast.error(getApiErrorMessage(error, 'SCORM upload failed')),
  })

  const handleFile = (file?: File | null) => {
    if (!file || uploading) return
    const error = validateScormFile(file)
    if (error) {
      toast.error(error)
      return
    }
    uploadScorm(file)
  }

  return (
    <div className="flex min-h-[calc(100vh-8rem)] flex-col gap-5">
      <PageHeader
        title="SCORM viewer"
        description="Upload a SCORM zip package and preview it inside the platform."
        actions={
          <>
          {packageInfo && (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => setViewerKey((current) => current + 1)}
            >
              <RotateCcw size={14} /> Reload
            </Button>
          )}
          {viewerUrl && (
            <a
              href={viewerUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-[var(--lux-line)] bg-transparent px-3 text-xs font-semibold text-[var(--lux-text)] transition-colors hover:border-[var(--lux-line-strong)] hover:bg-[var(--lux-primary-soft)]"
            >
              <ExternalLink size={14} /> Open
            </a>
          )}
          <Button
            type="button"
            size="sm"
            onClick={() => fileRef.current?.click()}
            loading={uploading}
          >
            <Upload size={14} /> Upload SCORM
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
            className={cn(
              'grid min-h-[170px] cursor-pointer place-items-center border-2 border-dashed p-6 text-center transition-all',
              isDragging
                ? 'border-[#0F6B4A] bg-[#0F6B4A]/12'
                : 'border-white/10 bg-white/3 hover:border-white/20 hover:bg-white/5',
            )}
            onClick={() => fileRef.current?.click()}
            onDragOver={(event) => {
              event.preventDefault()
              setIsDragging(true)
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(event) => {
              event.preventDefault()
              setIsDragging(false)
              handleFile(event.dataTransfer.files?.[0])
            }}
          >
            <div className="flex max-w-xl flex-col items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#0F6B4A]/18 text-[#83BFA1]">
                {uploading ? <Loader2 size={22} className="animate-spin" /> : <FileArchive size={22} />}
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-100">
                  {uploading ? 'Extracting SCORM package...' : 'Drop a SCORM zip here'}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Browse or drag a `.zip` package exported from a SCORM authoring tool.
                </p>
              </div>
            </div>
          </div>
        </CardBody>
      </Card>

      {packageInfo && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#0F6B4A]/18 text-[#83BFA1]">
                <FileCheck2 size={18} />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-100">{packageInfo.title}</p>
                <p className="truncate text-xs text-slate-500">{packageInfo.originalName}</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <p className="text-xs font-medium uppercase text-slate-500">Launch file</p>
            <p className="mt-1 truncate text-sm font-semibold text-slate-100">{packageInfo.launchPath}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs font-medium uppercase text-slate-500">Uploaded</p>
            <p className="mt-1 text-sm font-semibold text-slate-100">
              {formatBytes(packageInfo.size)} - {formatDate(packageInfo.uploadedAt)}
            </p>
          </Card>
        </div>
      )}

      <Card className="min-h-[560px] flex-1 overflow-hidden">
        {viewerUrl ? (
          <iframe
            key={viewerKey}
            src={viewerUrl}
            title={packageInfo?.title ?? 'SCORM viewer'}
            className="block h-[68vh] min-h-[560px] w-full border-0 bg-white"
            allow="fullscreen; autoplay; clipboard-read; clipboard-write"
            allowFullScreen
          />
        ) : (
          <div className="grid h-[560px] place-items-center p-6 text-center">
            <div className="flex max-w-sm flex-col items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white/5 text-slate-500">
                <MonitorPlay size={22} />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-200">No SCORM package loaded</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  Upload a zip package to display the course launch page here.
                </p>
              </div>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
