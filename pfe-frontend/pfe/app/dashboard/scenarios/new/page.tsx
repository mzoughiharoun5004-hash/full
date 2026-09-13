'use client'

import { InlineScenarioCourseEditor } from '../[id]/edit/_components/inline-course-editor/InlineScenarioCourseEditor'

export default function NewScenarioPage() {
  return (
    <div className="min-h-screen">
      <InlineScenarioCourseEditor mode="create" />
    </div>
  )
}
