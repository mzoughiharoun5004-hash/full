# AI Course Integration

## Status

**Phase:** MVP implemented; it requires a backend `GROQ_API_KEY` before it can call the hosted provider.

**Recommended first provider:** Groq Free Tier using `openai/gpt-oss-20b`.

The provider is hosted, so the project does not need to run or maintain model infrastructure. The model is open-weight under Apache-2.0; the application must still treat the provider as an external dependency whose free-tier limits can change.

## Product goals

1. Let an educator create a complete draft course from a short brief.
2. Let an educator use AI to propose edits to any existing course, whether it was created manually or by AI.
3. Keep the educator in control: every proposed change is previewed and explicitly accepted or rejected.
4. Produce content that works with the live course editor, readiness rules, SCORM export, and PDF export.
5. Preserve collaboration and never overwrite a newer course-document version.
6. Keep provider-specific code isolated so Groq can later be replaced without changing the editor.

## Agreed product scope

### Create with AI

```text
Brief → outline proposal → educator approval → generated draft → existing editor
```

The brief includes topic, target audience, language, difficulty, objectives, expected duration, course format, and optional source material. The first release supports Linear courses. Branching and Hybrid courses are deferred until generated links and export coverage are proven.

### Edit with AI

AI actions must be available on a course, lesson, block, or quiz in every editable course:

- Rewrite, simplify, expand, shorten, translate, or change tone.
- Create a knowledge check, quiz, flashcards, summary, or practice activity from selected content.
- Propose improvements for an entire course as individually selectable lesson changes.

AI does not receive database access, direct application tools, approval rights, export rights, or sharing rights.

## Technical decisions

| Area | Decision |
|---|---|
| Model | `openai/gpt-oss-20b` |
| Hosted provider | Groq Free Tier for MVP |
| Backend boundary | New NestJS `ai-course` module |
| Output | Strict JSON-schema response, never free-form course JSON alone |
| Mutation model | Validated `AiCoursePatch` plus explicit apply endpoint |
| Persistence target | Existing `Scenario.courseDocument` only |
| Course state | Generated courses remain `BROUILLON` and carry `metadata.source = 'ai_draft'` |
| Concurrency | Apply uses the existing `courseDocumentVersion` optimistic lock |
| Media | Generate placeholders and accessible alt text; do not download external assets in MVP |

The request to Groq must remain server-side. The browser must never receive the provider key.

## Target architecture

```text
AI creation wizard / editor AI action
                ↓
        NestJS ai-course module
  authorization → context builder → Groq provider
                ↓                       ↓
        patch validator ← strict JSON schema output
                ↓
      preview / accept / reject UI
                ↓
 ScenarioService.updateCourseDocument
                ↓
existing editor, readiness, collaboration, SCORM/PDF export
```

## Patch contract

The model proposes minimal operations instead of replacing a complete course document:

```ts
type AiCoursePatch =
  | { op: 'replace_block'; lessonId: string; blockId: string; block: CourseBlock }
  | { op: 'insert_blocks'; lessonId: string; afterBlockId?: string; blocks: CourseBlock[] }
  | { op: 'replace_lesson'; lessonId: string; lesson: CoursePage }
  | { op: 'insert_lesson'; afterLessonId?: string; lesson: CoursePage }
  | { op: 'update_metadata'; changes: Partial<CourseDocument> }
```

The server must reject a patch that references a missing ID, creates invalid quiz data, uses unsupported block types, leaves invalid branching destinations, exceeds configured limits, or fails course-readiness validation.

## What is already done

These capabilities were already present before the AI feature work began:

- The live authoring surface uses a structured, versioned `courseDocument` rather than the legacy relational tree.
- The editor supports lessons, quizzes, numerous interactive block types, branching blocks, course formats, previews, and readiness checks.
- Course-document autosave already uses optimistic concurrency through `courseDocumentVersion`.
- The backend already persists AI provenance through `courseDocument.metadata.source = 'ai_draft'`.
- Draft, review, approval, collaboration, SCORM 1.2, and PDF workflows already exist.
- The root workspace already contains an unused Cerebras SDK dependency reserved for a previous AI-generation idea; it must not be used by the new implementation and should be removed only after Groq is implemented and verified.
- This document records the approved direction: hosted Groq Free Tier plus `openai/gpt-oss-20b`, with a provider abstraction.

## What is missing

### Implemented

- NestJS `ai-course` module with authenticated outline, creation, proposal, apply, reject, cancel, and change-set retrieval endpoints.
- Server-only Groq adapter with a 90-second timeout, provider-error handling, strict JSON-schema responses, and an `AiCourseProvider` boundary.
- Persistent `AiChangeSet` audit records, including requester, selected scope, provider/model metadata, base document version, proposal, status, and timestamps.
- Creation wizard: brief → outline review → Linear draft course → existing editor.
- AI edit controls on course, lesson, and block scopes, with explicit proposal preview and accept/reject behavior.
- Optimistic-lock enforcement when proposing and applying changes; stale proposals cannot overwrite later edits.
- Strictly limited generated block types, size bounds, ID checks, source-material prompt-injection instructions, and no external-media URLs.
- `GROQ_API_KEY` onboarding entry in the backend `.env.example`.
- Unit coverage for proposal version checks and patch application.

### Deferred beyond the MVP

- Quiz-question generation and a dedicated quiz-scope action.
- Branching/Hybrid automatic generation, grounded document retrieval, and licensed media generation/search.
- Whole-course changes shown as individually selectable lesson patches rather than a single proposal.
- Provider failover, provider usage/token telemetry, product-level per-user AI quota, and scheduled evaluation exports.

## Delivery milestones

| Milestone | Outcome | Status |
|---|---|---|
| 0. Direction | Provider, model, safety boundaries, scope, and success criteria documented | Complete |
| 1. Foundation | Provider abstraction, Groq integration, schemas, auth, tests | Complete |
| 2. AI creation MVP | Brief → outline approval → Linear course draft in editor | Complete |
| 3. AI editing MVP | Course/lesson/block patch proposals with preview and apply/reject | Complete |
| 4. Course-wide assistance | Selectable multi-lesson improvement plans and regeneration | Deferred |
| 5. Advanced formats | Branching/Hybrid generation, grounded source material, media workflow | Not started |
| 6. Production readiness | Evaluation suite, quotas, observability, provider fallback | Not started |

## Acceptance criteria for the MVP

- An authorized educator can generate a Linear draft from an approved outline.
- The generated result opens without conversion in the existing editor.
- The generated course passes schema validation and can be exported through existing SCORM/PDF flows when readiness requirements are met.
- An educator can request, preview, accept, or reject an AI edit to a manual course.
- Rejected proposals do not change the course.
- A stale proposal cannot overwrite a collaborator’s newer course version.
- Provider keys and raw provider calls never reach the browser.
- A provider failure leaves the existing course unchanged and gives the educator a retry option.

## Setup and verification

1. Copy the `GROQ_API_KEY` line from `pfe-backend/pfe_backend/.env.example` into the backend `.env` and set a real key.
2. Run `npm run test` and `npm run build` from the repository root.
3. Create an AI outline from `/dashboard/scenarios/new`, approve it, and verify the resulting draft can open in the editor.
4. Use Ask AI at course, lesson, and block scope. Confirm rejection makes no content change and acceptance creates a new course-document version.
