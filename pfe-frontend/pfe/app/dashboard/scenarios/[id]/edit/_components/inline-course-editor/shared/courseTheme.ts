import type { CourseDocument, CourseTheme } from '@/types'

export const COURSE_THEME_PRESETS = [
  { id: 'emerald', label: 'Emerald', accent: '#0F6B4A' },
  { id: 'ocean',   label: 'Ocean',   accent: '#2563EB' },
  { id: 'violet',  label: 'Violet',  accent: '#7C3AED' },
  { id: 'rose',    label: 'Rose',    accent: '#E11D48' },
  { id: 'amber',   label: 'Amber',   accent: '#D97706' },
  { id: 'slate',   label: 'Slate',   accent: '#64748B' },
]

export const DEFAULT_COURSE_THEME: CourseTheme = {
  accentColor: '#0F6B4A',
  fontPairing: 'modern',
  coverLayout: 'centered',
  navigationMode: 'continuous',
  lessonNumbers: true,
  sidebarEnabled: true,
}

export function updateCourseTheme(document: CourseDocument, patch: Partial<CourseTheme>): CourseDocument {
  return {
    ...document,
    theme: {
      ...DEFAULT_COURSE_THEME,
      ...document.theme,
      ...patch,
    },
  }
}
