'use client'

import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import {
  Eye,
  FileText,
  Film,
  Image as ImageIcon,
  Link2,
  Music,
  Search,
  Trash2,
  Upload,
} from 'lucide-react'
import { getApiErrorMessage, mediaApi } from '@/lib/api'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { PageHeader } from '@/components/ui/PageHeader'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { Spinner } from '@/components/ui/Spinner'
import { formatBytes, formatDate } from '@/lib/utils'
import type { MediaAsset, MediaType } from '@/types'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

const typeFilters: { label: string; value: MediaType | 'ALL' }[] = [
  { label: 'All', value: 'ALL' },
  { label: 'Images', value: 'IMAGE' },
  { label: 'Videos', value: 'VIDEO' },
  { label: 'Audio', value: 'AUDIO' },
  { label: 'Documents', value: 'DOCUMENT' },
]

const typeIcon: Record<MediaType, React.ElementType> = {
  IMAGE: ImageIcon,
  VIDEO: Film,
  AUDIO: Music,
  DOCUMENT: FileText,
}

const typeColor: Record<MediaType, string> = {
  IMAGE: 'text-[var(--lux-primary-muted)] bg-[var(--lux-primary-soft)] border-[var(--lux-primary)]/20',
  VIDEO: 'text-[var(--lux-primary-muted)] bg-[var(--lux-primary-soft)] border-[var(--lux-primary)]/20',
  AUDIO: 'text-[var(--lux-info)] bg-[var(--lux-info-soft)] border-[var(--lux-info)]/20',
  DOCUMENT: 'text-[var(--lux-gold)] bg-[var(--lux-gold-soft)] border-[var(--lux-gold)]/20',
}

function assetUrl(asset: MediaAsset): string {
  return asset.url.startsWith('http') ? asset.url : `${API_URL}${asset.url}`
}

function PreviewModal({ asset, onClose }: { asset: MediaAsset; onClose: () => void }) {
  const url = assetUrl(asset)

  return (
    <Modal open onClose={onClose} title={asset.originalName} size="lg">
      <div className="space-y-4">
        {asset.type === 'IMAGE' && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={asset.originalName} className="max-h-80 w-full rounded-2xl object-contain border border-[var(--lux-line)]" />
        )}
        {asset.type === 'VIDEO' && (
          <video src={url} controls className="max-h-80 w-full rounded-2xl border border-[var(--lux-line)]" />
        )}
        {asset.type === 'AUDIO' && <audio src={url} controls className="w-full" />}
        {asset.type === 'DOCUMENT' && (
          <div className="flex items-center justify-center rounded-2xl border border-[var(--lux-line)] bg-[var(--lux-surface-soft)] py-12 text-[var(--lux-muted-soft)]">
            <FileText size={48} />
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl border border-[var(--lux-line)] bg-[var(--lux-surface-soft)] p-3">
            <span className="text-xs text-[var(--lux-muted-soft)] font-medium">File Size</span>
            <p className="text-sm font-bold text-[var(--lux-text-strong)]">{formatBytes(asset.size)}</p>
          </div>
          <div className="rounded-xl border border-[var(--lux-line)] bg-[var(--lux-surface-soft)] p-3">
            <span className="text-xs text-[var(--lux-muted-soft)] font-medium">Upload Date</span>
            <p className="text-sm font-bold text-[var(--lux-text-strong)]">{formatDate(asset.createdAt)}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-xl border border-[var(--lux-line)] bg-[var(--lux-surface-soft)] px-3.5 py-2.5">
          <Link2 size={15} className="flex-shrink-0 text-[var(--lux-muted-soft)]" />
          <code className="min-w-0 flex-1 truncate text-xs text-[var(--lux-text-strong)]">{url}</code>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => {
              navigator.clipboard.writeText(url)
              toast.success('URL copied to clipboard')
            }}
          >
            Copy
          </Button>
        </div>
      </div>
    </Modal>
  )
}

export default function MediaPage() {
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [typeFilter, setTypeFilter] = useState<MediaType | 'ALL'>('ALL')
  const [search, setSearch] = useState('')
  const [preview, setPreview] = useState<MediaAsset | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [assetPendingDelete, setAssetPendingDelete] = useState<MediaAsset | null>(null)

  const { data, isLoading } = useQuery<MediaAsset[]>({
    queryKey: ['media', typeFilter, search],
    queryFn: () =>
      mediaApi
        .getAll({
          type: typeFilter === 'ALL' ? undefined : typeFilter,
          search: search || undefined,
        })
        .then((response) => response.data),
  })

  const { mutate: uploadFile, isPending: uploading } = useMutation({
    mutationFn: (file: File) => mediaApi.upload(file),
    onSuccess: () => {
      toast.success('File uploaded')
      qc.invalidateQueries({ queryKey: ['media'] })
    },
    onError: (error) => toast.error(getApiErrorMessage(error, 'Upload failed')),
  })

  const { mutate: deleteAsset } = useMutation({
    mutationFn: (id: string) => mediaApi.delete(id),
    onSuccess: () => {
      toast.success('Deleted')
      qc.invalidateQueries({ queryKey: ['media'] })
    },
  })

  const handleFiles = (files: FileList | null) => {
    if (!files) return
    Array.from(files).forEach((file) => uploadFile(file))
  }

  const assets = data ?? []

  return (
    <div className="space-y-6 fade-up">
      <PageHeader
        eyebrow="Asset Repository"
        title="Media library"
        description={`${assets.length} asset${assets.length !== 1 ? 's' : ''} available to your course workspace`}
        actions={
          <Button size="sm" onClick={() => fileRef.current?.click()} loading={uploading}>
            <Upload size={15} />
            Upload file
          </Button>
        }
      />
      <input
        ref={fileRef}
        type="file"
        multiple
        className="hidden"
        accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.csv,.txt"
        onChange={(event) => {
          handleFiles(event.target.files)
          event.currentTarget.value = ''
        }}
      />

      <div
        onDragOver={(event) => {
          event.preventDefault()
          setIsDragging(true)
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(event) => {
          event.preventDefault()
          setIsDragging(false)
          handleFiles(event.dataTransfer.files)
        }}
        onClick={() => fileRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2.5 rounded-2xl border-2 border-dashed p-8 transition-all duration-200 select-none ${
          isDragging
            ? 'border-[var(--lux-primary)] bg-[var(--lux-primary-soft)] scale-[1.01]'
            : 'border-[var(--lux-line)]/90 bg-[var(--lux-surface-soft)]/50 hover:border-[var(--lux-primary)]/50 hover:bg-[var(--lux-surface-soft)]'
        }`}
      >
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[var(--lux-primary-soft)] text-[var(--lux-primary-muted)] shadow-xs">
          <Upload size={22} />
        </div>
        <div className="text-center">
          <p className="text-sm font-bold text-[var(--lux-text-strong)]">
            Drop files here or <span className="text-[var(--lux-primary-muted)] underline underline-offset-4">browse</span>
          </p>
          <p className="mt-1 text-xs font-medium text-[var(--lux-muted-soft)]">
            Supports Images, Videos, Audio, and PDF/Office Documents
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="w-full sm:max-w-xs">
          <Input
            id="media-search"
            placeholder="Search files..."
            icon={<Search size={14} />}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <SegmentedControl
          items={typeFilters}
          value={typeFilter}
          onChange={setTypeFilter}
          ariaLabel="Filter media by type"
        />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      ) : assets.length === 0 ? (
        <EmptyState icon={<ImageIcon size={24} />} title="No media files" description="Upload images, videos, audio or documents to use across your courses" />
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
          {assets.map((asset) => {
            const Icon = typeIcon[asset.type] ?? FileText
            const colorCls = typeColor[asset.type] ?? 'bg-[var(--lux-surface-soft)] text-[var(--lux-muted)]'

            return (
              <div
                key={asset.id}
                className="group flex flex-col overflow-hidden rounded-2xl border border-[var(--lux-line)]/80 bg-[var(--lux-surface)] transition-all duration-300 hover:-translate-y-1 hover:border-[var(--lux-primary)]/40 hover:shadow-lg"
              >
                <button
                  type="button"
                  className="relative flex aspect-video w-full cursor-pointer items-center justify-center overflow-hidden bg-[var(--lux-surface-soft)]"
                  onClick={() => setPreview(asset)}
                >
                  {asset.type === 'IMAGE' ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={assetUrl(asset)} alt={asset.originalName} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
                  ) : asset.type === 'VIDEO' ? (
                    <video src={assetUrl(asset)} className="h-full w-full object-cover" muted />
                  ) : (
                    <div className={`flex h-12 w-12 items-center justify-center rounded-xl border ${colorCls}`}>
                      <Icon size={22} />
                    </div>
                  )}
                  <span className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-xs opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                    <span className="grid h-10 w-10 place-items-center rounded-full bg-[var(--lux-surface)] text-[var(--lux-text-strong)] shadow-lg">
                      <Eye size={19} />
                    </span>
                  </span>
                </button>

                <div className="flex flex-1 flex-col justify-between p-3">
                  <div>
                    <p className="truncate text-xs font-bold text-[var(--lux-text-strong)]" title={asset.originalName}>{asset.originalName}</p>
                    <p className="mt-0.5 text-[11px] font-medium text-[var(--lux-muted-soft)]">{formatBytes(asset.size)}</p>
                  </div>
                  <div className="mt-2.5 flex items-center justify-between border-t border-[var(--lux-line)]/50 pt-2">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--lux-muted-soft)]">{asset.type}</span>
                    <button
                      type="button"
                      onClick={() => setAssetPendingDelete(asset)}
                      className="grid h-7 w-7 place-items-center rounded-lg text-[var(--lux-muted-soft)] transition-colors hover:bg-red-500/12 hover:text-red-400"
                      title="Delete asset"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {preview && <PreviewModal asset={preview} onClose={() => setPreview(null)} />}

      <ConfirmDialog
        open={assetPendingDelete !== null}
        title={assetPendingDelete ? `Delete "${assetPendingDelete.originalName}"?` : ''}
        description="This action cannot be undone."
        confirmLabel="Delete"
        onConfirm={() => {
          if (assetPendingDelete) deleteAsset(assetPendingDelete.id)
          setAssetPendingDelete(null)
        }}
        onCancel={() => setAssetPendingDelete(null)}
      />
    </div>
  )
}

