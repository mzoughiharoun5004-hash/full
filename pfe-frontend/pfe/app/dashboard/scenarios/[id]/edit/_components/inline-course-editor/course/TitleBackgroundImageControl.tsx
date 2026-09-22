import { useRef, useState, type DragEvent } from 'react'
import { toast } from 'react-hot-toast'
import { Image as ImageIcon, LibraryBig, UploadCloud, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { getApiErrorMessage, mediaApi } from '@/lib/api'
import { cn } from '@/lib/utils'
import { MediaPicker } from '../../MediaPicker'
import { inputClass } from '../shared/editorStyles'
import { uploadedAssetUrl, mediaPickerAssetUrl } from '../shared/mediaHelpers'

export function TitleBackgroundImageControl({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [uploading, setUploading] = useState(false)
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const imageUrl = value ? uploadedAssetUrl(value) : ''

  const uploadImage = async (file: File) => {
    if (uploading) return
    if (!file.type.startsWith('image/')) {
      toast.error('Upload an image file.')
      return
    }

    setUploading(true)
    try {
      const response = await mediaApi.upload(file)
      onChange(uploadedAssetUrl(response.data.url))
      toast.success('Title background uploaded')
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Upload failed'))
    } finally {
      setUploading(false)
    }
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDragActive(false)
    const file = event.dataTransfer.files?.[0]
    if (file) void uploadImage(file)
  }

  return (
    <div
      className={cn(
        'mt-5 rounded-lg border border-dashed border-[var(--lux-line)] bg-[var(--lux-surface-soft)] p-3 transition',
        dragActive && 'border-[var(--lux-primary)] bg-[var(--lux-primary-soft)]',
      )}
      onDragEnter={(event) => {
        event.preventDefault()
        setDragActive(true)
      }}
      onDragOver={(event) => {
        event.preventDefault()
        setDragActive(true)
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setDragActive(false)
        }
      }}
      onDrop={handleDrop}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="grid h-14 w-20 shrink-0 place-items-center overflow-hidden rounded-md border border-[var(--lux-line)] bg-[var(--lux-surface)] text-[var(--lux-muted)]">
            {imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <ImageIcon size={20} />
            )}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-[var(--lux-muted-soft)]">{label}</p>
            <p className="mt-0.5 text-xs text-[var(--lux-muted)]">Drag and drop an image here, upload one, or paste a URL.</p>
            <input
              value={value}
              onChange={(event) => onChange(event.target.value)}
              placeholder="Image URL"
              className={cn(inputClass, 'mt-1 w-full min-w-0')}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <Button type="button" size="sm" variant="secondary" loading={uploading} onClick={() => fileInputRef.current?.click()}>
            <UploadCloud size={14} />
            Upload
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={() => setMediaPickerOpen(true)}>
            <LibraryBig size={14} />
            Media library
          </Button>
          {value && (
            <Button type="button" size="sm" variant="ghost" onClick={() => onChange('')}>
              <X size={14} />
              Remove
            </Button>
          )}
        </div>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) void uploadImage(file)
          event.currentTarget.value = ''
        }}
      />
      {mediaPickerOpen && (
        <MediaPicker
          open={mediaPickerOpen}
          onClose={() => setMediaPickerOpen(false)}
          acceptedTypes={['IMAGE']}
          onSelect={(asset) => {
            onChange(mediaPickerAssetUrl(asset))
            setMediaPickerOpen(false)
          }}
        />
      )}
    </div>
  )
}
