'use client'

import { useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import { FileText, Film, Image as ImageIcon, Search, Upload } from 'lucide-react'
import { getApiErrorMessage, mediaApi } from '@/lib/api'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Spinner } from '@/components/ui/Spinner'
import { formatBytes } from '@/lib/utils'
import type { MediaAsset, MediaType } from '@/types'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

interface MediaPickerProps {
  open: boolean
  onClose: () => void
  acceptedTypes: MediaType[]
  onSelect: (asset: MediaAsset) => void
  scenarioId?: number
}

function assetUrl(asset: MediaAsset): string {
  return asset.url.startsWith('http') ? asset.url : `${API_URL}${asset.url}`
}

function typeIcon(type: MediaType) {
  if (type === 'VIDEO') return Film
  if (type === 'IMAGE') return ImageIcon
  return FileText
}

function acceptFromTypes(types: MediaType[]): string {
  const accept: string[] = []
  if (types.includes('IMAGE')) accept.push('image/*')
  if (types.includes('VIDEO')) accept.push('video/*')
  if (types.includes('AUDIO')) accept.push('audio/*')
  if (types.includes('DOCUMENT')) accept.push('.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.csv,.txt')
  return accept.join(',')
}

export function MediaPicker({ open, onClose, acceptedTypes, onSelect, scenarioId }: MediaPickerProps) {
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [search, setSearch] = useState('')
  const params = useParams()
  const routeScenarioId = params?.id && typeof params.id === 'string' && !isNaN(parseInt(params.id, 10))
    ? parseInt(params.id, 10)
    : undefined
  const effectiveScenarioId = scenarioId ?? routeScenarioId

  const primaryType = acceptedTypes.length === 1 ? acceptedTypes[0] : undefined
  const { data: assets, isLoading } = useQuery<MediaAsset[]>({
    queryKey: ['media-picker', effectiveScenarioId, acceptedTypes.join(','), search],
    queryFn: () => {
      const fetcher = effectiveScenarioId
        ? mediaApi.getByScenario(effectiveScenarioId, {
            type: primaryType,
            search: search || undefined,
          })
        : mediaApi.getAll({
            type: primaryType,
            search: search || undefined,
          })
      return fetcher.then((response) =>
        response.data.filter((asset: MediaAsset) => acceptedTypes.includes(asset.type)),
      )
    },
    enabled: open,
  })

  const { mutate: uploadFile, isPending: uploading } = useMutation({
    mutationFn: (file: File) => mediaApi.upload(file, effectiveScenarioId),
    onSuccess: (response) => {
      toast.success('File uploaded')
      qc.invalidateQueries({ queryKey: ['media'] })
      qc.invalidateQueries({ queryKey: ['media-picker'] })
      onSelect(response.data)
      onClose()
    },
    onError: (error) => toast.error(getApiErrorMessage(error, 'Upload failed')),
  })

  const handleFileChange = (files: FileList | null) => {
    const file = files?.[0]
    if (file) uploadFile(file)
  }

  return (
    <Modal open={open} onClose={onClose} title="Select media" size="xl" className="max-h-[85vh] overflow-hidden">
      <div className="flex max-h-[68vh] flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <Input
            id="media-picker-search"
            placeholder="Search media..."
            icon={<Search size={14} />}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <Button size="sm" onClick={() => fileRef.current?.click()} loading={uploading}>
            <Upload size={14} className="mr-1" /> Upload
          </Button>
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            accept={acceptFromTypes(acceptedTypes)}
            onChange={(event) => {
              handleFileChange(event.target.files)
              event.currentTarget.value = ''
            }}
          />
        </div>

        {isLoading ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : !assets?.length ? (
          <div className="rounded-xl border border-white/10 bg-white/4 px-4 py-8 text-center text-sm text-slate-500">
            No matching media yet.
          </div>
        ) : (
          <div className="grid flex-1 grid-cols-1 gap-3 overflow-y-auto pr-1 sm:grid-cols-2 lux-scrollbar">
            {assets.map((asset) => {
              const Icon = typeIcon(asset.type)

              return (
                <button
                  key={asset.id}
                  type="button"
                  onClick={() => {
                    onSelect(asset)
                    onClose()
                  }}
                  className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/4 p-2 text-left transition-colors hover:border-[#0F6B4A]/60 hover:bg-[#0F6B4A]/10"
                >
                  <div className="flex aspect-video w-24 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white/5">
                    {asset.type === 'IMAGE' ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={assetUrl(asset)} alt={asset.originalName} className="h-full w-full object-cover" />
                    ) : asset.type === 'VIDEO' ? (
                      <video src={assetUrl(asset)} className="h-full w-full object-cover" muted />
                    ) : (
                      <Icon size={22} className="text-amber-400" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-200">{asset.originalName}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{asset.type} · {formatBytes(asset.size)}</p>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </Modal>
  )
}
