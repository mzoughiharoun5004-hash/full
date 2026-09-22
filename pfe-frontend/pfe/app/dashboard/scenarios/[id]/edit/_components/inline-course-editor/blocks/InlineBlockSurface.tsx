import { useRef, useState, type DragEvent } from 'react'
import Image from 'next/image'
import { toast } from 'react-hot-toast'
import {
  ChevronDown,
  Download,
  GripVertical,
  Image as ImageIcon,
  Plus,
  Trash2,
  UploadCloud,
  Video,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { getApiErrorMessage, mediaApi } from '@/lib/api'
import { cn } from '@/lib/utils'
import type {
  CourseBlock,
  CourseInteractionItem,
  CourseLesson,
  MediaAsset,
  MediaType,
} from '@/types'
import {
  branchingDecisionBlockTypes,
  getBlockDefinition,
  isQuestionBlock,
  uid,
} from '../courseEditorModel'
import { MediaPicker } from '../../MediaPicker'
import { InlineAddButton } from './InlineAddButton'
import { ItemsEditor } from './ItemsEditor'
import { MetadataFields } from './MetadataFields'
import { QuestionCommonSettings } from './QuestionCommonSettings'
import { statementStyleLabel, statementCalloutLabel } from '../preview/PreviewStatementBlock'
import { chartDataToString, type ChartDataItem, chartItemsForEditor } from '../shared/chartHelpers'
import {
  inputClass,
  textareaClass,
  selectClass,
  ghostInputClass,
  inlineSurfaceInputClass,
  inlineSurfaceTextareaClass,
} from '../shared/editorStyles'
import {
  uploadableBlockTypes,
  itemMediaAccept,
  type ItemUploadKind,
  type MediaPickerTarget,
  uploadedAssetUrl,
  acceptForBlockType,
  acceptsDroppedFile,
  acceptsItemUploadFile,
  eventHasFiles,
  mediaTypesForBlockType,
  mediaTypesForItemUpload,
  mediaPickerAssetUrl,
} from '../shared/mediaHelpers'
import { Field, IconButton } from '../shared/uiPrimitives'

export function InlineBlockSurface({
  block,
  currentLessonId,
  lessonDestinations,
  editing,
  readOnly,
  onFocus,
  onUpdate,
}: {
  block: CourseBlock
  currentLessonId: string
  lessonDestinations: CourseLesson[]
  editing: boolean
  readOnly: boolean
  onFocus: () => void
  onUpdate: (updater: (block: CourseBlock) => CourseBlock) => void
}) {
  const definition = getBlockDefinition(block.type)
  const metadata = block.metadata ?? {}
  const items = block.items ?? []
  const update = (patch: Partial<CourseBlock>) => onUpdate((current) => ({ ...current, ...patch }))
  const updateMetadata = (key: string, value: unknown) => {
    onUpdate((current) => ({ ...current, metadata: { ...current.metadata, [key]: value } }))
  }
  const updateStatementStyle = (value: string) => {
    const label = statementStyleLabel(value)
    onUpdate((current) => ({
      ...current,
      title: statementCalloutLabel(current.title, label),
      metadata: { ...current.metadata, style: value },
    }))
  }
  const updateItems = (nextItems: CourseInteractionItem[]) => update({ items: nextItems })
  const updateItem = (id: string, patch: Partial<CourseInteractionItem>) => {
    updateItems(items.map((item) => item.id === id ? { ...item, ...patch } : item))
  }
  const addItem = (patch: Partial<CourseInteractionItem> = {}) => {
    updateItems([...items, { id: uid('item'), title: '', content: '', ...patch }])
  }
  const removeItem = (id: string) => updateItems(items.filter((item) => item.id !== id))
  const moveItem = (id: string, direction: -1 | 1) => {
    const currentIndex = items.findIndex((item) => item.id === id)
    const nextIndex = currentIndex + direction
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= items.length) return
    const nextItems = [...items]
    const [item] = nextItems.splice(currentIndex, 1)
    nextItems.splice(nextIndex, 0, item)
    updateItems(nextItems)
  }
  const meta = (key: string, fallback = '') => String(metadata[key] ?? fallback)
  const [dragActive, setDragActive] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [draggingItemId, setDraggingItemId] = useState<string | null>(null)
  const [fileDropItemId, setFileDropItemId] = useState<string | null>(null)
  const [pendingItemUpload, setPendingItemUpload] = useState<{ id: string; kind: ItemUploadKind } | null>(null)
  const [uploadingItemId, setUploadingItemId] = useState<string | null>(null)
  const [pendingMetadataImageKey, setPendingMetadataImageKey] = useState<string | null>(null)
  const [uploadingMetadataImageKey, setUploadingMetadataImageKey] = useState<string | null>(null)
  const [metadataDropKey, setMetadataDropKey] = useState<string | null>(null)
  const [mediaPickerTarget, setMediaPickerTarget] = useState<MediaPickerTarget | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const itemFileInputRef = useRef<HTMLInputElement | null>(null)
  const metadataImageInputRef = useRef<HTMLInputElement | null>(null)
  const pendingItemUploadRef = useRef<{ id: string; kind: ItemUploadKind } | null>(null)
  const pendingMetadataImageKeyRef = useRef<string | null>(null)
  const selectedBlockMediaTypes: MediaType[] = mediaPickerTarget
    ? mediaPickerTarget.kind === 'block'
      ? mediaTypesForBlockType(block.type)
      : mediaPickerTarget.kind === 'item'
        ? mediaTypesForItemUpload(mediaPickerTarget.uploadKind)
        : ['IMAGE']
    : ['IMAGE']

  const applyMediaAssetToBlock = (asset: MediaAsset) => {
    const url = mediaPickerAssetUrl(asset)
    onUpdate((current) => ({
      ...current,
      title: current.title || asset.originalName,
      assetUrl: url,
      metadata: {
        ...current.metadata,
        fileName: asset.originalName,
        fileSize: asset.size,
        mimeType: asset.mimetype,
        ...(current.type === 'file_download'
          ? {
              fileUrl: url,
              label: String(current.metadata?.label ?? '') || asset.originalName,
            }
          : {}),
        ...(current.type === 'resource_link' ? { url } : {}),
      },
    }))
  }

  const applyMediaPickerAsset = (asset: MediaAsset) => {
    if (!mediaPickerTarget) return
    if (mediaPickerTarget.kind === 'block') {
      applyMediaAssetToBlock(asset)
    } else if (mediaPickerTarget.kind === 'item') {
      updateItem(mediaPickerTarget.itemId, { mediaUrl: mediaPickerAssetUrl(asset) })
    } else {
      updateMetadata(mediaPickerTarget.key, uploadedAssetUrl(mediaPickerAssetUrl(asset)))
    }
    setMediaPickerTarget(null)
  }

  const applyUploadedFile = async (file: File) => {
    if (readOnly || uploading) return
    if (!acceptsDroppedFile(block, file)) {
      toast.error('This file type does not match the selected block.')
      return
    }

    setUploading(true)
    try {
      const response = await mediaApi.upload(file)
      applyMediaAssetToBlock(response.data)
      toast.success('File uploaded')
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Upload failed'))
    } finally {
      setUploading(false)
      setDragActive(false)
    }
  }

  const applyUploadedItemFile = async (itemId: string, file: File, kind: ItemUploadKind) => {
    if (readOnly || uploadingItemId) return
    if (!acceptsItemUploadFile(file, kind)) {
      toast.error(kind === 'image' ? 'Upload an image for this item.' : 'Upload an image, video, or audio file for this item.')
      return
    }

    setUploadingItemId(itemId)
    try {
      const response = await mediaApi.upload(file)
      const asset = response.data
      updateItem(itemId, { mediaUrl: uploadedAssetUrl(asset.url) })
      toast.success('Item media uploaded')
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Upload failed'))
    } finally {
      setUploadingItemId(null)
      setFileDropItemId(null)
    }
  }

  const applyUploadedMetadataImage = async (key: string, file: File) => {
    if (readOnly || uploadingMetadataImageKey) return
    if (!file.type.startsWith('image/')) {
      toast.error('Upload an image file.')
      return
    }

    setUploadingMetadataImageKey(key)
    try {
      const response = await mediaApi.upload(file)
      updateMetadata(key, uploadedAssetUrl(response.data.url))
      toast.success('Image uploaded')
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Upload failed'))
    } finally {
      setUploadingMetadataImageKey(null)
      setMetadataDropKey(null)
    }
  }

  const openItemFileUpload = (itemId: string, kind: ItemUploadKind) => {
    const target = { id: itemId, kind }
    pendingItemUploadRef.current = target
    setPendingItemUpload(target)
    itemFileInputRef.current?.click()
  }

  const openMetadataImageUpload = (key: string) => {
    pendingMetadataImageKeyRef.current = key
    setPendingMetadataImageKey(key)
    metadataImageInputRef.current?.click()
  }

  const handleFileDrop = (event: DragEvent<HTMLDivElement>) => {
    if (readOnly) return
    const file = event.dataTransfer.files?.[0]
    if (!file) return
    event.preventDefault()
    event.stopPropagation()
    void applyUploadedFile(file)
  }

  const handleFileDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (readOnly || !eventHasFiles(event)) return
    event.preventDefault()
    event.stopPropagation()
    setDragActive(true)
  }

  const moveItemTo = (draggedId: string, targetId: string) => {
    if (draggedId === targetId) return
    const currentIndex = items.findIndex((item) => item.id === draggedId)
    const nextIndex = items.findIndex((item) => item.id === targetId)
    if (currentIndex < 0 || nextIndex < 0) return
    const nextItems = [...items]
    const [item] = nextItems.splice(currentIndex, 1)
    nextItems.splice(nextIndex, 0, item)
    updateItems(nextItems)
  }

  const handleItemDragOver = (event: DragEvent<HTMLDivElement>, targetId: string) => {
    if (!draggingItemId || draggingItemId === targetId || eventHasFiles(event)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }

  const handleItemDrop = (event: DragEvent<HTMLDivElement>, targetId: string) => {
    if (!draggingItemId || eventHasFiles(event)) return
    event.preventDefault()
    moveItemTo(draggingItemId, targetId)
    setDraggingItemId(null)
  }

  const handleItemMediaDragOver = (event: DragEvent<HTMLDivElement>, itemId: string, kind: ItemUploadKind) => {
    if (readOnly || !eventHasFiles(event)) return
    const file = event.dataTransfer.items?.[0]
    if (file && kind === 'image' && file.type && !file.type.startsWith('image/')) return
    event.preventDefault()
    event.stopPropagation()
    setFileDropItemId(itemId)
  }

  const handleItemFileDrop = (event: DragEvent<HTMLDivElement>, itemId: string, kind: ItemUploadKind) => {
    if (readOnly) return
    const file = event.dataTransfer.files?.[0]
    if (!file) return
    event.preventDefault()
    event.stopPropagation()
    void applyUploadedItemFile(itemId, file, kind)
  }

  const handleMetadataImageDragOver = (event: DragEvent<HTMLDivElement>, key: string) => {
    if (readOnly || !eventHasFiles(event)) return
    const file = event.dataTransfer.items?.[0]
    if (file?.type && !file.type.startsWith('image/')) return
    event.preventDefault()
    event.stopPropagation()
    setMetadataDropKey(key)
  }

  const handleMetadataImageDrop = (event: DragEvent<HTMLDivElement>, key: string) => {
    if (readOnly) return
    const file = event.dataTransfer.files?.[0]
    if (!file) return
    event.preventDefault()
    event.stopPropagation()
    setMetadataDropKey(null)
    void applyUploadedMetadataImage(key, file)
  }

  const renderItemMediaControls = (item: CourseInteractionItem, label: string, kind: ItemUploadKind = 'media') => (
    <div
      className={cn(
        'mt-2 space-y-2 rounded-lg border border-dashed border-[var(--lux-line)] bg-[var(--lux-surface-soft)] p-2 transition',
        fileDropItemId === item.id && 'border-[var(--lux-primary)] bg-[var(--lux-primary-soft)]',
      )}
      onDragOver={(event) => handleItemMediaDragOver(event, item.id, kind)}
      onDragEnter={(event) => handleItemMediaDragOver(event, item.id, kind)}
      onDragLeave={() => setFileDropItemId((current) => current === item.id ? null : current)}
      onDrop={(event) => handleItemFileDrop(event, item.id, kind)}
    >
      <input
        value={item.mediaUrl ?? ''}
        onChange={(event) => updateItem(item.id, { mediaUrl: uploadedAssetUrl(event.target.value) })}
        placeholder={`${label} URL`}
        className={inlineSurfaceInputClass}
      />
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-2 px-2 text-xs font-medium text-[var(--lux-muted)]">
          <UploadCloud size={14} className="text-[var(--lux-primary-muted)]" />
          <span className="min-w-0 flex-1">{kind === 'image' ? 'Drop an image here' : 'Drop image, video, or audio here'}</span>
          <Button
            size="sm"
            variant="secondary"
            loading={uploadingItemId === item.id}
            onClick={() => openItemFileUpload(item.id, kind)}
          >
            Upload
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setMediaPickerTarget({ kind: 'item', itemId: item.id, uploadKind: kind })}
          >
            Media library
          </Button>
        </div>
      )}
    </div>
  )

  const renderMetadataImageUpload = (key: string, label: string) => (
    <div
      className={cn(
        'flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-[var(--lux-line)] bg-[var(--lux-surface-soft)] px-3 py-2 text-xs font-medium text-[var(--lux-muted)] transition',
        metadataDropKey === key && 'border-[var(--lux-primary)] bg-[var(--lux-primary-soft)]',
      )}
      onDragOver={(event) => handleMetadataImageDragOver(event, key)}
      onDragEnter={(event) => handleMetadataImageDragOver(event, key)}
      onDragLeave={() => setMetadataDropKey((current) => current === key ? null : current)}
      onDrop={(event) => handleMetadataImageDrop(event, key)}
    >
      <UploadCloud size={14} className="text-[var(--lux-primary-muted)]" />
      <span className="min-w-0 flex-1">{label} or drop an image</span>
      <Button
        size="sm"
        variant="secondary"
        loading={uploadingMetadataImageKey === key}
        onClick={() => openMetadataImageUpload(key)}
      >
        Upload
      </Button>
      <Button
        size="sm"
        variant="secondary"
        onClick={() => setMediaPickerTarget({ kind: 'metadata', key })}
      >
        Media library
      </Button>
    </div>
  )

  return (
    <div
      className={cn(
        'rounded-lg border border-transparent px-4 py-4 transition',
        editing && 'border-[var(--lux-line)] bg-[var(--lux-surface-soft)] shadow-[var(--lux-shadow)]',
      )}
      onFocusCapture={readOnly ? undefined : onFocus}
      onClick={readOnly ? undefined : onFocus}
    >
      <fieldset disabled={readOnly} className="contents">
      <input
        ref={itemFileInputRef}
        type="file"
        accept={itemMediaAccept}
        className="hidden"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0]
          const target = pendingItemUploadRef.current ?? pendingItemUpload
          if (file && target) void applyUploadedItemFile(target.id, file, target.kind)
          event.currentTarget.value = ''
          pendingItemUploadRef.current = null
          setPendingItemUpload(null)
        }}
      />
      <input
        ref={metadataImageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0]
          const targetKey = pendingMetadataImageKeyRef.current ?? pendingMetadataImageKey
          if (file && targetKey) void applyUploadedMetadataImage(targetKey, file)
          event.currentTarget.value = ''
          pendingMetadataImageKeyRef.current = null
          setPendingMetadataImageKey(null)
        }}
      />
      {(() => {
        if (block.type === 'heading') {
          return (
            <div className="space-y-2">
              <select
                value={meta('level', 'H2')}
                onChange={(event) => updateMetadata('level', event.target.value)}
                className={cn(selectClass, 'w-28')}
              >
                <option value="H1">H1</option>
                <option value="H2">H2</option>
                <option value="H3">H3</option>
              </select>
              <input
                value={block.title ?? ''}
                onChange={(event) => update({ title: event.target.value })}
                placeholder="Heading"
                className={cn(ghostInputClass, 'text-3xl font-bold leading-tight text-[var(--lux-text-strong)]')}
              />
              <input
                value={meta('subtitle')}
                onChange={(event) => updateMetadata('subtitle', event.target.value)}
                placeholder="Subtitle"
                className={cn(ghostInputClass, 'text-lg text-[var(--lux-muted)]')}
              />
            </div>
          )
        }

        if (block.type === 'text' || block.type === 'paragraph') {
          return (
            <div className="space-y-3">
              <input
                value={block.title ?? ''}
                onChange={(event) => update({ title: event.target.value })}
                placeholder="Heading"
                className={cn(ghostInputClass, 'text-2xl font-bold text-[var(--lux-text-strong)]')}
              />
              <textarea
                value={block.content ?? ''}
                onChange={(event) => update({ content: event.target.value })}
                rows={5}
                placeholder="Start writing..."
                className={cn(ghostInputClass, 'resize-none font-serif text-2xl leading-9')}
              />
            </div>
          )
        }

        if (block.type === 'callout') {
          return (
            <div className="rounded-lg border border-[var(--lux-line)] bg-[var(--lux-surface)] p-5">
              <div className="mb-3 flex flex-wrap items-center gap-3">
                <select
                  value={statementStyleLabel(meta('style', 'Info'))}
                  onChange={(event) => {
                    const label = statementStyleLabel(event.target.value)
                    onUpdate((current) => ({
                      ...current,
                      title: statementCalloutLabel(current.title, label),
                      metadata: { ...current.metadata, style: label },
                    }))
                  }}
                  className={selectClass}
                >
                  {['Info', 'Warning', 'Tip', 'Note'].map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
                <input
                  value={block.title ?? ''}
                  onChange={(event) => update({ title: event.target.value })}
                  placeholder={definition.label}
                  className={cn(ghostInputClass, 'min-w-[180px] flex-1 text-lg font-bold text-[var(--lux-text-strong)]')}
                />
              </div>
              <textarea
                value={block.content ?? ''}
                onChange={(event) => update({ content: event.target.value })}
                rows={3}
                placeholder="Add emphasis text..."
                className={cn(inlineSurfaceTextareaClass, 'text-xl font-semibold leading-8')}
              />
            </div>
          )
        }

        if (block.type === 'statement') {
          return (
            <div className="space-y-3 rounded-lg border border-[var(--lux-line)] bg-[var(--lux-surface)] p-5">
              <select
                value={statementStyleLabel(meta('style', 'Info'))}
                onChange={(event) => updateStatementStyle(event.target.value)}
                className={selectClass}
              >
                {['Info', 'Warning', 'Tip', 'Note'].map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
              <textarea
                value={block.content ?? ''}
                onChange={(event) => {
                  const label = statementStyleLabel(meta('style', 'Info'))
                  update({
                    content: event.target.value,
                    title: statementCalloutLabel(block.title, label),
                  })
                }}
                rows={4}
                placeholder="Key takeaway, summary, or core concept..."
                className={cn(inlineSurfaceTextareaClass, 'text-2xl font-semibold leading-9')}
              />
            </div>
          )
        }

        if (block.type === 'quote') {
          return (
            <figure className="space-y-4 border-l-4 border-[var(--lux-primary)] pl-6">
              <textarea
                value={block.content ?? ''}
                onChange={(event) => update({ content: event.target.value })}
                rows={3}
                placeholder="Add quote..."
                className={cn(ghostInputClass, 'resize-none font-serif text-3xl leading-tight text-[var(--lux-text-strong)]')}
              />
              <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr]">
                <input value={meta('attributionName')} onChange={(event) => updateMetadata('attributionName', event.target.value)} placeholder="Attribution" className={inlineSurfaceInputClass} />
                <input value={meta('attributionRole')} onChange={(event) => updateMetadata('attributionRole', event.target.value)} placeholder="Role or source" className={inlineSurfaceInputClass} />
              </div>
              <MetadataFields block={block} onChange={updateMetadata} />
              {renderMetadataImageUpload('avatarUrl', 'Upload avatar image')}
            </figure>
          )
        }

        if (['numbered_list', 'list', 'checklist', 'ordering', 'process_steps', 'timeline', 'lesson_summary'].includes(block.type)) {
          const ordered = ['numbered_list', 'ordering', 'process_steps', 'timeline'].includes(block.type)
          const supportsItemMedia = block.type === 'process_steps'
          return (
            <div className="space-y-5">
              <input
                value={block.title ?? ''}
                onChange={(event) => update({ title: event.target.value })}
                placeholder={definition.label}
                className={cn(ghostInputClass, 'text-2xl font-bold text-[var(--lux-text-strong)]')}
              />
              {block.type === 'process_steps' && (
                <>
                  <MetadataFields block={block} onChange={updateMetadata} />
                  {renderMetadataImageUpload('introImageUrl', 'Upload process intro image')}
                </>
              )}
              <div className="space-y-4">
                {items.map((item, itemIndex) => (
                  <div
                    key={item.id}
                    draggable={!readOnly}
                    onDragStart={() => setDraggingItemId(item.id)}
                    onDragOver={(event) => handleItemDragOver(event, item.id)}
                    onDrop={(event) => handleItemDrop(event, item.id)}
                    onDragEnd={() => setDraggingItemId(null)}
                    className={cn(
                      'grid gap-4 rounded-lg border border-transparent p-2 transition sm:grid-cols-[1fr_auto]',
                      draggingItemId === item.id && 'border-[var(--lux-primary)] opacity-60',
                    )}
                  >
                    <div className="space-y-2">
                      <input value={item.title} onChange={(event) => updateItem(item.id, { title: event.target.value })} placeholder={ordered ? 'Step title' : 'Item title'} className={cn(inlineSurfaceInputClass, 'text-lg font-semibold')} />
                      <textarea value={item.content ?? ''} onChange={(event) => updateItem(item.id, { content: event.target.value })} rows={2} placeholder="Detail" className={inlineSurfaceTextareaClass} />
                      {supportsItemMedia && renderItemMediaControls(item, 'Step media')}
                    </div>
                    {!readOnly && (
                      <div className="flex items-start justify-end gap-1">
                        <IconButton label="Drag item"><GripVertical size={16} /></IconButton>
                        <IconButton label="Move item up" disabled={itemIndex === 0} onClick={() => moveItem(item.id, -1)}><ChevronDown size={16} className="rotate-180" /></IconButton>
                        <IconButton label="Move item down" disabled={itemIndex === items.length - 1} onClick={() => moveItem(item.id, 1)}><ChevronDown size={16} /></IconButton>
                        <IconButton label="Remove item" onClick={() => removeItem(item.id)}><Trash2 size={16} /></IconButton>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {!readOnly && <InlineAddButton onClick={() => addItem()}>Add item</InlineAddButton>}
            </div>
          )
        }

        if (block.type === 'divider' || block.type === 'spacer') {
          return (
            <div className="py-4">
              <div className="flex items-center gap-4">
                <span className="h-px flex-1 bg-[var(--lux-line)]" />
                <input
                  value={meta('label')}
                  onChange={(event) => updateMetadata('label', event.target.value)}
                  placeholder={block.type === 'spacer' ? 'Spacer' : 'Divider'}
                  className="w-40 bg-transparent text-center text-xs font-bold uppercase text-[var(--lux-muted)] outline-none placeholder:text-[var(--lux-muted-soft)]"
                />
                <span className="h-px flex-1 bg-[var(--lux-line)]" />
              </div>
            </div>
          )
        }

        if (['image', 'video', 'audio', 'attachment', 'document', 'file_download', 'resource_link'].includes(block.type)) {
          const isImage = block.type === 'image'
          const isVideo = block.type === 'video'
          const isAudio = block.type === 'audio'
          const acceptsUpload = uploadableBlockTypes.includes(block.type)
          return (
            <div className="space-y-4">
                <input value={block.title ?? ''} onChange={(event) => update({ title: event.target.value })} placeholder={definition.label} className={cn(ghostInputClass, 'text-xl font-bold text-[var(--lux-text-strong)]')} />
              <div
                className={cn(
                  'rounded-lg border border-[var(--lux-line)] bg-[var(--lux-surface)] p-5 transition',
                  acceptsUpload && !readOnly && dragActive && 'border-[var(--lux-primary)] bg-[var(--lux-primary-soft)]',
                )}
                onDragOver={acceptsUpload ? handleFileDragOver : undefined}
                onDragEnter={acceptsUpload ? handleFileDragOver : undefined}
                onDragLeave={acceptsUpload ? (event) => {
                  if (!eventHasFiles(event)) return
                  event.preventDefault()
                  event.stopPropagation()
                  setDragActive(false)
                } : undefined}
                onDrop={acceptsUpload ? handleFileDrop : undefined}
              >
                {isImage && block.assetUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={block.assetUrl} alt={meta('alt')} className="max-h-[420px] w-full rounded object-contain" />
                ) : isVideo && block.assetUrl ? (
                  <video controls src={block.assetUrl} className="w-full rounded" />
                ) : isAudio && block.assetUrl ? (
                  <audio controls src={block.assetUrl} className="w-full" />
                ) : block.assetUrl ? (
                  <a
                    href={block.assetUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex min-h-32 items-center gap-3 rounded border border-[var(--lux-line)] bg-[var(--lux-surface-soft)] p-4 text-sm text-[var(--lux-text)] hover:border-[var(--lux-primary)]"
                  >
                    <Download size={26} className="text-[var(--lux-primary-muted)]" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{meta('fileName', block.title || definition.label)}</span>
                      <span className="mt-1 block truncate text-xs text-[var(--lux-muted)]">{block.assetUrl}</span>
                    </span>
                  </a>
                ) : isVideo && meta('aiGeneratedStoryboard') ? (
                  <div className="space-y-3 rounded border border-dashed border-[var(--lux-primary)] bg-[var(--lux-primary-soft)] p-5 text-left">
                    <div className="flex items-center gap-2 font-semibold text-[var(--lux-text-strong)]"><Video size={22} /> AI video storyboard</div>
                    <p className="text-sm leading-6 text-[var(--lux-text)]">{block.content}</p>
                    {(block.items ?? []).length > 0 && <ol className="list-decimal space-y-1 pl-5 text-sm text-[var(--lux-muted)]">{block.items?.map((item) => <li key={item.id}>{item.title}{item.content ? ` — ${item.content}` : ''}</li>)}</ol>}
                    <div className="flex flex-wrap items-center gap-3 pt-1">
                      <p className="text-xs text-[var(--lux-muted)]">Upload a video file above, or find one online:</p>
                      {meta('youtubeSearchUrl') && (
                        <a href={String(meta('youtubeSearchUrl'))} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded bg-red-600 px-3 py-1 text-xs font-semibold text-white hover:bg-red-700">
                          <svg viewBox="0 0 24 24" className="h-3 w-3 fill-current" aria-hidden><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
                          Search YouTube
                        </a>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="grid min-h-40 place-items-center rounded border border-dashed border-[var(--lux-line)] bg-[var(--lux-surface-soft)] text-center text-sm text-[var(--lux-muted)]">
                    <div>
                      {isImage ? <ImageIcon className="mx-auto mb-2" size={28} /> : isVideo ? <Video className="mx-auto mb-2" size={28} /> : acceptsUpload ? <UploadCloud className="mx-auto mb-2" size={28} /> : <Download className="mx-auto mb-2" size={28} />}
                      {acceptsUpload ? 'No file selected' : 'Add media URL below'}
                    </div>
                  </div>
                )}
                {acceptsUpload && !readOnly && (
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={uploading}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <UploadCloud size={14} className="mr-1" />
                      Upload file
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setMediaPickerTarget({ kind: 'block' })}
                    >
                      Media library
                    </Button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept={acceptForBlockType(block.type)}
                      className="hidden"
                      onChange={(event) => {
                        const file = event.currentTarget.files?.[0]
                        if (file) void applyUploadedFile(file)
                        event.currentTarget.value = ''
                      }}
                    />
                  </div>
                )}
                <input value={block.assetUrl ?? ''} onChange={(event) => update({ assetUrl: event.target.value })} placeholder="Media or file URL" className={cn(inputClass, 'mt-4 w-full')} />
              </div>
              <input value={meta('caption', meta('label'))} onChange={(event) => updateMetadata(block.type === 'file_download' ? 'label' : 'caption', event.target.value)} placeholder="Caption or display label" className={inlineSurfaceInputClass} />
            </div>
          )
        }

        if (block.type === 'image_gallery' || block.type === 'gallery') {
          return (
            <div className="space-y-4">
              <input value={block.title ?? ''} onChange={(event) => update({ title: event.target.value })} placeholder="Gallery title" className={cn(ghostInputClass, 'text-2xl font-bold text-[var(--lux-text-strong)]')} />
              <div className="grid gap-3 sm:grid-cols-2">
                {items.map((item) => (
                  <div
                    key={item.id}
                    draggable={!readOnly}
                    onDragStart={() => setDraggingItemId(item.id)}
                    onDragOver={(event) => handleItemDragOver(event, item.id)}
                    onDrop={(event) => handleItemDrop(event, item.id)}
                    onDragEnd={() => setDraggingItemId(null)}
                    className={cn(
                      'rounded-lg border border-[var(--lux-line)] bg-[var(--lux-surface)] p-3 transition',
                      draggingItemId === item.id && 'border-[var(--lux-primary)] opacity-60',
                    )}
                  >
                    {item.mediaUrl ? (
                      <div className="relative aspect-video w-full overflow-hidden rounded bg-[var(--lux-surface-soft)]">
                        <Image
                          src={uploadedAssetUrl(item.mediaUrl)}
                          alt=""
                          fill
                          sizes="(min-width: 1024px) 240px, (min-width: 640px) 50vw, 100vw"
                          className="object-contain"
                          unoptimized
                        />
                      </div>
                    ) : (
                      <div className="grid aspect-video place-items-center rounded bg-[var(--lux-surface-soft)] text-sm text-[var(--lux-muted)]">Image</div>
                    )}
                    {renderItemMediaControls(item, 'Image', 'image')}
                    <input value={item.title} onChange={(event) => updateItem(item.id, { title: event.target.value })} placeholder="Caption" className={cn(inlineSurfaceInputClass, 'mt-1')} />
                    {!readOnly && (
                      <div className="mt-2 flex items-center justify-between">
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--lux-muted)]"><GripVertical size={13} /> Drag</span>
                        <button type="button" onClick={() => removeItem(item.id)} className="text-xs font-semibold text-[var(--lux-muted)] hover:text-red-400">Remove</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {!readOnly && <InlineAddButton onClick={() => addItem({ mediaUrl: '' })}>Add image</InlineAddButton>}
            </div>
          )
        }

        if (branchingDecisionBlockTypes.includes(block.type)) {
          const destinations = lessonDestinations.filter((lesson) => lesson.id !== currentLessonId)
          return (
            <div className="space-y-4">
              <div>
                <input value={block.title ?? ''} onChange={(event) => update({ title: event.target.value })} placeholder={block.type === 'choice_point' ? 'Decision title' : 'Branching dialogue title'} className={cn(ghostInputClass, 'text-2xl font-bold text-[var(--lux-text-strong)]')} />
                <textarea value={block.content ?? ''} onChange={(event) => update({ content: event.target.value })} rows={3} placeholder="Set up the choice for the learner..." className={cn(inlineSurfaceTextareaClass, 'mt-2')} />
              </div>
              <div className="rounded-lg border border-[var(--lux-line)] bg-[var(--lux-surface-soft)] px-3 py-3 text-xs leading-5 text-[var(--lux-muted)]">
                Each choice must point to a different course item. The selected route is used in preview and in the exported SCORM package.
              </div>
              <div className="space-y-3">
                {items.map((item, itemIndex) => (
                  <div key={item.id} className="rounded-lg border border-[var(--lux-line)] bg-[var(--lux-surface)] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-bold uppercase tracking-wide text-[var(--lux-primary-muted)]">Choice {itemIndex + 1}</p>
                      {!readOnly && <IconButton label={`Remove choice ${itemIndex + 1}`} onClick={() => removeItem(item.id)}><Trash2 size={14} /></IconButton>}
                    </div>
                    <input value={item.title} onChange={(event) => updateItem(item.id, { title: event.target.value })} placeholder="Choice label" className={cn(inlineSurfaceInputClass, 'mt-2 font-semibold')} />
                    <textarea value={item.content ?? ''} onChange={(event) => updateItem(item.id, { content: event.target.value })} rows={2} placeholder="Optional feedback shown before routing" className={cn(inlineSurfaceTextareaClass, 'mt-2')} />
                    <select value={item.match ?? ''} onChange={(event) => updateItem(item.id, { match: event.target.value })} className={cn(selectClass, 'mt-2 w-full')} disabled={readOnly}>
                      <option value="">Choose destination...</option>
                      {destinations.map((lesson) => <option key={lesson.id} value={lesson.id}>{lesson.type === 'quiz' ? 'Quiz' : 'Lesson'}: {lesson.title || 'Untitled item'}</option>)}
                    </select>
                  </div>
                ))}
              </div>
              {!readOnly && <InlineAddButton onClick={() => addItem({ match: '' })}>Add choice</InlineAddButton>}
              {!destinations.length && <p className="text-xs text-amber-500">Add another course item before linking this decision.</p>}
            </div>
          )
        }

        if (['accordion', 'tabs', 'flashcards', 'reveal', 'sorting_activity', 'sorting', 'matching', 'dialogue', 'consequence', 'decision_recap', 'branch_merge', 'conditional_gate', 'character_monologue', 'before_after', 'hotspot', 'labeled_graphic', 'scenario'].includes(block.type)) {
          const isSortingBlock = ['sorting_activity', 'sorting'].includes(block.type)
          const supportsPanelMedia = ['accordion', 'tabs', 'flashcards'].includes(block.type)
          return (
            <div className="space-y-4">
              <input value={block.title ?? ''} onChange={(event) => update({ title: event.target.value })} placeholder={definition.label} className={cn(ghostInputClass, 'text-2xl font-bold text-[var(--lux-text-strong)]')} />
              <textarea value={block.content ?? ''} onChange={(event) => update({ content: event.target.value })} rows={3} placeholder="Prompt or intro" className={inlineSurfaceTextareaClass} />
              {(['accordion', 'tabs', 'flashcards'].includes(block.type) || isSortingBlock) && <MetadataFields block={block} onChange={updateMetadata} />}
              <div className={cn('grid gap-3', block.type === 'flashcards' && 'sm:grid-cols-2')}>
                {items.map((item, itemIndex) => (
                  <div
                    key={item.id}
                    draggable={!readOnly}
                    onDragStart={() => setDraggingItemId(item.id)}
                    onDragOver={(event) => handleItemDragOver(event, item.id)}
                    onDrop={(event) => handleItemDrop(event, item.id)}
                    onDragEnd={() => setDraggingItemId(null)}
                    className={cn(
                      'rounded-lg border border-[var(--lux-line)] bg-[var(--lux-surface)] p-4 transition',
                      draggingItemId === item.id && 'border-[var(--lux-primary)] opacity-60',
                    )}
                  >
                    {!readOnly && (
                      <div className="mb-3 flex items-center justify-end gap-1">
                        <IconButton label="Drag item"><GripVertical size={14} /></IconButton>
                        <IconButton label="Move item up" disabled={itemIndex === 0} onClick={() => moveItem(item.id, -1)}><ChevronDown size={14} className="rotate-180" /></IconButton>
                        <IconButton label="Move item down" disabled={itemIndex === items.length - 1} onClick={() => moveItem(item.id, 1)}><ChevronDown size={14} /></IconButton>
                        <IconButton label="Remove" onClick={() => removeItem(item.id)}><Trash2 size={14} /></IconButton>
                      </div>
                    )}
                    <input value={item.title} onChange={(event) => updateItem(item.id, { title: event.target.value.slice(0, isSortingBlock ? 80 : undefined) })} placeholder={isSortingBlock ? 'Sortable item text' : block.type === 'flashcards' ? 'Front side' : block.type === 'tabs' ? 'Tab title' : block.type === 'accordion' ? 'Header' : 'Title'} className={cn(inlineSurfaceInputClass, 'font-semibold')} />
                    <textarea value={item.content ?? ''} onChange={(event) => updateItem(item.id, { content: event.target.value })} rows={3} placeholder={isSortingBlock ? 'Optional feedback or note' : block.type === 'flashcards' ? 'Back side' : block.type === 'matching' ? 'Category or response' : 'Content'} className={cn(inlineSurfaceTextareaClass, 'mt-2')} />
                    {supportsPanelMedia && renderItemMediaControls(item, block.type === 'flashcards' ? 'Card image' : 'Panel media')}
                    {block.type === 'flashcards' && item.mediaUrl && (
                      <div className="mt-2 inline-flex w-fit overflow-hidden rounded-full border border-[var(--lux-line)] bg-[var(--lux-surface)] p-1">
                        {(['front', 'back'] as const).map((side) => (
                          <button
                            key={side}
                            type="button"
                            onClick={() => updateItem(item.id, { match: side })}
                            className={cn(
                              'px-3 py-1 text-xs font-bold capitalize transition',
                              (item.match || 'front') === side ? 'bg-[var(--lux-primary)] text-white rounded-full' : 'text-[var(--lux-muted)] hover:text-[var(--lux-text-strong)]'
                            )}
                          >
                            Image on {side}
                          </button>
                        ))}
                      </div>
                    )}
                    {['matching', 'sorting_activity', 'sorting'].includes(block.type) && (
                      <input value={item.match ?? ''} onChange={(event) => updateItem(item.id, { match: event.target.value })} placeholder={isSortingBlock ? 'Target category' : 'Match or category'} className={cn(inlineSurfaceInputClass, 'mt-2')} />
                    )}
                    {isSortingBlock && <p className="mt-2 text-xs font-medium text-[var(--lux-muted-soft)]">Items are capped at 80 characters. Use up to 4 unique target categories.</p>}
                  </div>
                ))}
              </div>
              {!readOnly && <InlineAddButton onClick={() => addItem()}>{isSortingBlock ? 'Add sortable item' : block.type === 'flashcards' ? 'Add card' : 'Add panel'}</InlineAddButton>}
            </div>
          )
        }

        if (isQuestionBlock(block.type) || block.type === 'knowledge_check') {
          return (
            <div className="space-y-4 rounded-lg border border-[var(--lux-line)] bg-[var(--lux-surface)] p-5">
              <input value={block.title ?? ''} onChange={(event) => update({ title: event.target.value })} placeholder="Question" className={cn(ghostInputClass, 'text-2xl font-bold text-[var(--lux-text-strong)]')} />
              <textarea value={block.content ?? ''} onChange={(event) => update({ content: event.target.value })} rows={2} placeholder="Optional instructions" className={inlineSurfaceTextareaClass} />
              <div className="space-y-2">
                {items.map((item) => (
                  <div key={item.id} className="grid gap-2 rounded-lg border border-[var(--lux-line)] bg-[var(--lux-surface-soft)] p-2 sm:grid-cols-[auto_1fr_auto]">
                    <label className="flex items-center gap-2 text-xs font-semibold text-[var(--lux-muted)]">
                      <input
                        type={block.type === 'multiple_select' ? 'checkbox' : 'radio'}
                        name={`correct-${block.id}`}
                        checked={item.content === 'true'}
                        onChange={(event) => updateItem(item.id, { content: event.target.checked ? 'true' : 'false' })}
                      />
                      Correct
                    </label>
                    <input value={item.title} onChange={(event) => updateItem(item.id, { title: event.target.value })} placeholder="Answer" className={inlineSurfaceInputClass} />
                    {!readOnly && <IconButton label="Remove answer" onClick={() => removeItem(item.id)}><Trash2 size={14} /></IconButton>}
                  </div>
                ))}
              </div>
              {!readOnly && <InlineAddButton onClick={() => addItem({ content: 'false' })}>Add answer</InlineAddButton>}
              <QuestionCommonSettings block={block} onChange={updateMetadata} />
            </div>
          )
        }

        if (block.type === 'table') {
          return (
            <div className="space-y-4">
              <input value={block.title ?? ''} onChange={(event) => update({ title: event.target.value })} placeholder="Table title" className={cn(ghostInputClass, 'text-2xl font-bold text-[var(--lux-text-strong)]')} />
              <textarea value={block.content ?? ''} onChange={(event) => update({ content: event.target.value })} rows={5} placeholder="Paste table rows as CSV or tab-separated text" className={cn(textareaClass, 'font-mono')} />
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Rows"><input type="number" value={Number(metadata.rows ?? 3)} onChange={(event) => updateMetadata('rows', Number(event.target.value))} className={inputClass} /></Field>
                <Field label="Columns"><input type="number" value={Number(metadata.columns ?? 3)} onChange={(event) => updateMetadata('columns', Number(event.target.value))} className={inputClass} /></Field>
                <label className="flex items-end gap-2 pb-2 text-sm text-[var(--lux-muted)]"><input type="checkbox" checked={Boolean(metadata.headerRow ?? true)} onChange={(event) => updateMetadata('headerRow', event.target.checked)} /> Header row</label>
              </div>
            </div>
          )
        }

        if (block.type === 'chart') {
          const chartItems = chartItemsForEditor(metadata.data)
          const updateChartItems = (nextItems: ChartDataItem[]) => updateMetadata('data', chartDataToString(nextItems.slice(0, 12)))
          const updateChartItem = (itemId: string, patch: Partial<ChartDataItem>) => {
            updateChartItems(chartItems.map((item) => item.id === itemId ? { ...item, ...patch } : item))
          }
          const removeChartItem = (itemId: string) => updateChartItems(chartItems.filter((item) => item.id !== itemId))

          return (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-3">
                <input value={meta('chartTitle', block.title ?? '')} onChange={(event) => updateMetadata('chartTitle', event.target.value)} placeholder="Chart title" className={cn(inlineSurfaceInputClass, 'min-w-[240px] flex-1 text-xl font-bold')} />
                <select value={meta('chartType', 'bar')} onChange={(event) => updateMetadata('chartType', event.target.value)} className={selectClass}>
                  <option value="bar">Bar</option>
                  <option value="line">Line</option>
                  <option value="pie">Pie</option>
                </select>
              </div>
              <div className="rounded-lg border border-[var(--lux-line)] bg-[var(--lux-surface)] p-3">
                <div className="mb-2 grid grid-cols-[minmax(0,1fr)_112px_32px] gap-2 px-1 text-xs font-bold uppercase tracking-wide text-[var(--lux-muted-soft)]">
                  <span>Label</span>
                  <span>Value</span>
                  <span />
                </div>
                <div className="space-y-2">
                  {chartItems.map((item) => (
                    <div key={item.id} className="grid grid-cols-[minmax(0,1fr)_112px_32px] gap-2">
                      <input
                        value={item.label}
                        maxLength={30}
                        onChange={(event) => updateChartItem(item.id, { label: event.target.value.slice(0, 30) })}
                        className={inputClass}
                      />
                      <input
                        type="number"
                        value={item.value}
                        min={0}
                        onChange={(event) => updateChartItem(item.id, { value: Number(event.target.value) || 0 })}
                        className={inputClass}
                      />
                      {!readOnly && (
                        <button type="button" onClick={() => removeChartItem(item.id)} className="grid h-10 w-8 place-items-center rounded-lg text-[var(--lux-muted-soft)] hover:bg-red-500/10 hover:text-red-400">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                {!readOnly && chartItems.length < 12 && (
                  <button
                    type="button"
                    onClick={() => updateChartItems([...chartItems, { id: uid('chart'), label: `Item ${chartItems.length + 1}`, value: 0 }])}
                    className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-[var(--lux-primary-muted)] hover:text-[var(--lux-primary)]"
                  >
                    <Plus size={14} />
                    Add data item
                  </button>
                )}
              </div>
              <input value={meta('axisLabels')} onChange={(event) => updateMetadata('axisLabels', event.target.value)} placeholder="Axis labels" className={inlineSurfaceInputClass} />
            </div>
          )
        }

        if (block.type === 'code') {
          return (
            <div className="space-y-3">
              <input value={block.title ?? ''} onChange={(event) => update({ title: event.target.value })} placeholder="Code title" className={cn(ghostInputClass, 'text-xl font-bold text-[var(--lux-text-strong)]')} />
              <textarea value={block.content ?? ''} onChange={(event) => update({ content: event.target.value })} rows={8} placeholder="Paste code..." className={cn(textareaClass, 'font-mono')} />
            </div>
          )
        }

        if (['continue_button', 'button', 'restart_button'].includes(block.type)) {
          return (
            <div className="flex flex-col items-center gap-4 py-6">
              <input value={meta('label', block.content || block.title || definition.label)} onChange={(event) => updateMetadata('label', event.target.value)} className="w-full max-w-xs rounded-full bg-[var(--lux-primary)] px-6 py-3 text-center text-base font-bold text-[var(--lux-text-strong)] outline-none placeholder:text-[var(--lux-text-strong)]/70" />
            </div>
          )
        }

        return (
          <div className="space-y-3">
            <input value={block.title ?? ''} onChange={(event) => update({ title: event.target.value })} placeholder={definition.label} className={cn(ghostInputClass, 'text-2xl font-bold text-[var(--lux-text-strong)]')} />
            <textarea value={block.content ?? ''} onChange={(event) => update({ content: event.target.value })} rows={4} placeholder={definition.description} className={inlineSurfaceTextareaClass} />
            <MetadataFields block={block} onChange={updateMetadata} />
            {items.length > 0 && <ItemsEditor block={block} readOnly={readOnly} onUpdateItems={updateItems} />}
          </div>
        )
      })()}
      </fieldset>
      {mediaPickerTarget && !readOnly && (
        <MediaPicker
          open={Boolean(mediaPickerTarget)}
          onClose={() => setMediaPickerTarget(null)}
          acceptedTypes={selectedBlockMediaTypes}
          onSelect={applyMediaPickerAsset}
        />
      )}
    </div>
  )
}
