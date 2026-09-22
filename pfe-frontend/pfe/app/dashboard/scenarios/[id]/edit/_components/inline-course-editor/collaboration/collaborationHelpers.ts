import type { CollaborationUser } from '@/context/SocketContext'
import type { CourseLesson, ScenarioComment } from '@/types'

export function lessonLockId(lessonId: string) {
  return `lesson:${lessonId}`
}

export function collaborationUserName(user: CollaborationUser | ScenarioComment['author'] | undefined) {
  if (!user) return 'Collaborator'
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ').trim()
  return fullName || user.email || `User #${user.id}`
}

export function commentTargetLabel(comment: ScenarioComment, lessons: CourseLesson[]) {
  if (comment.targetType === 'course') return 'Course'
  if (comment.targetType === 'lesson') {
    return lessons.find((lesson) => lesson.id === comment.targetId)?.title || 'Deleted lesson'
  }
  return comment.targetId ? `Module ${comment.targetId}` : 'Module'
}
