import type { DragEvent } from 'react'
import type { CourseBlock, CourseBlockType, MediaAsset, MediaType } from '@/types'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

export const uploadableBlockTypes: CourseBlockType[] = ['image', 'video', 'audio', 'attachment', 'document', 'file_download']

export const itemMediaAccept = 'image/*,video/*,audio/*'

export type ItemUploadKind = 'media' | 'image'

export type MediaPickerTarget =
  | { kind: 'block' }
  | { kind: 'item'; itemId: string; uploadKind: ItemUploadKind }
  | { kind: 'metadata'; key: string }

export function uploadedAssetUrl(url: string): string {
  if (!url || url.startsWith('http') || url.startsWith('data:') || url.startsWith('blob:')) return url
  return `${API_URL}${url.startsWith('/') ? url : `/${url}`}`
}

export function acceptForBlockType(type: CourseBlockType): string | undefined {
  if (type === 'image') return 'image/*'
  if (type === 'video') return 'video/*'
  if (type === 'audio') return 'audio/*'
  if (type === 'attachment' || type === 'document' || type === 'file_download') {
    return '.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.csv,.txt,image/*,video/*,audio/*'
  }
  return undefined
}

export function acceptsDroppedFile(block: CourseBlock, file: File): boolean {
  if (block.type === 'image') return file.type.startsWith('image/')
  if (block.type === 'video') return file.type.startsWith('video/')
  if (block.type === 'audio') return file.type.startsWith('audio/')
  return uploadableBlockTypes.includes(block.type)
}

export function acceptsItemUploadFile(file: File, kind: ItemUploadKind): boolean {
  if (kind === 'image') return file.type.startsWith('image/')
  return file.type.startsWith('image/') || file.type.startsWith('video/') || file.type.startsWith('audio/')
}

export function eventHasFiles(event: DragEvent<HTMLElement>): boolean {
  return Array.from(event.dataTransfer.types).includes('Files')
}

export function mediaTypesForBlockType(type: CourseBlockType): MediaType[] {
  if (type === 'image') return ['IMAGE']
  if (type === 'video') return ['VIDEO']
  if (type === 'audio') return ['AUDIO']
  if (['attachment', 'document', 'file_download', 'resource_link'].includes(type)) return ['IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT']
  return ['IMAGE']
}

export function mediaTypesForItemUpload(kind: ItemUploadKind): MediaType[] {
  return kind === 'image' ? ['IMAGE'] : ['IMAGE', 'VIDEO', 'AUDIO']
}

export function mediaPickerAssetUrl(asset: MediaAsset): string {
  return uploadedAssetUrl(asset.url)
}
