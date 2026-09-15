# ARCHITECTURE.md

Living reference for the `supscenario` project — for you and for any AI agent working in this repo. Update the relevant section here whenever a module gets touched, rather than appending a changelog. See §8.

## 1. What this project is

NestJS backend + Next.js 16 / React 19 frontend for authoring pedagogical "scenarios" (courses): a module → sequence → activity → quiz → question → answer content hierarchy, exportable to SCORM 1.2. The backend supports real-time multi-author collaboration, sharing, comments, change proposals, and an admin approval workflow. The shipped frontend currently centers on the inline `courseDocument` editor; the legacy relational tree and `scenarioDocument` flow graph are API-direct/legacy paths.

## 2. Repo layout

```
C:\Users\harou\full\
├── pfe-backend/pfe_backend/   NestJS API — see §3
├── pfe-frontend/pfe/          Next.js app — see §4
├── scripts/dev.mjs            runs backend + frontend dev servers together (`npm run dev`)
├── rapport/                   NOT application code — this is the author's PFE thesis
│                              write-up (Word docs, PDF guide, generation scripts).
│                              Don't confuse with src/rapport/, the backend analytics module.
├── AGENTS.md                  AI-agent conventions for this repo (diff-only edits, no
│                              courtesy text). Its "Next.js 14" line was stale; fixed
│                              to 16 as part of writing this file.
└── ARCHITECTURE.md            this file
```

Root `package.json` also lists `@cerebras/cerebras_cloud_sdk` as a dependency. No import of it turned up in anything read for this audit, but both `courseDocument.metadata.source` and `scenarioDocument.metadata.source` model an `'ai_draft'` value in their type definitions. The project owner confirmed this dependency is for a planned AI course-generation feature, so do not remove it just because it is unused today.

## 3. Backend (`pfe-backend/pfe_backend`, NestJS 11 + TypeORM + Postgres)

### 3.1 Module map

| Module | Purpose |
|---|---|
| `auth` | login, JWT issuance/validation (`AuthGuard`) |
| `role` | `Role` entity + `@Roles()` decorator + `RoleGuard` (registered globally) |
| `users` | user CRUD, admin user management, enforces "at least one admin must remain" |
| `seeder` | bootstraps admin/teacher accounts + one demo scenario on app start |
| `scenario` | the core aggregate — see §3.3 |
| `course-module` / `sequence` / `activite` / `quiz` / `question` / `reponse` | the relational content tree under a scenario |
| `ressource` | media/file metadata, optionally attached to a scenario and/or module |
| `media` | multipart upload handler that attaches a file to a `ressource` |
| `scenario-share` | collaborator invites, comments, activity log, change proposals |
| `scenario-collaboration` | Socket.IO gateway for live co-editing (presence, cursors, per-element locks) |
| `ai-course` | Hosted Groq/GPT-OSS course outline, draft generation, and version-locked patch proposals; full drafts use JSON-object output plus server-side validation because GPT-OSS can omit nullable strict-schema fields. AI drafts require varied native editor blocks and fill them with editable content; image briefs become embedded SVG course visuals and video briefs become editable storyboards until an author uploads a video. Supports course, lesson, and block scoped edits (`replace_block`, `remove_block`, `insert_blocks`, `replace_lesson`), version-locks against `courseDocumentVersion`, and keeps `courseDocument.pages` synchronized upon application; see `AI_COURSE_INTEGRATION.md` |
| `scorm` | SCORM 1.2 zip export, PDF export (Puppeteer + PDFKit), plus a separate SCORM-zip **upload-and-preview** utility |
| `rapport` | analytics/reporting — per-scenario / per-user / global stats, admin dashboard |

Backend ESLint keeps type-aware safety rules enabled for application code. Test files have a narrow override for unsafe mock/private-helper access, which is necessary for the service and browser-runtime unit tests without weakening production checks.

### 3.2 Auth & permissions

- JWT bearer auth via `AuthGuard`, applied per-controller (not global). `RoleGuard` **is** registered globally but is a no-op on routes without `@Roles(...)`.
- Roles are free-form strings in a `Role` entity (just an id + name); the seeder creates `admin`/`teacher` accounts. There is no "student"/learner role — actual learners only ever encounter this system's content via an exported SCORM package in an external LMS, never through this API. (Relevant if you're ever tempted to flag quiz `correctAnswer` being present in API responses as an answer-key leak — it isn't, since only authors/admins call this API.)
- Authorization for scenario content (view/edit) is implemented **three separate times** and has already drifted between copies — see Issue #4.
- `Ressource`/`Media` use a *different* model again: ownership is `uploadedBy === requester`, not scenario-based — see Issue #5.
- `rapport` has **no ownership check at all** beyond the blanket guards — see Issue #6.

### 3.3 The scenario aggregate — three representations of the same content

A `Scenario` carries:
1. The relational tree (`modules → sequences → activites → quiz → questions → reponses`) — the original model.
2. `courseDocument` (JSONB, versioned via `courseDocumentVersion`) — a page/lesson/block document consumed by the inline course editor and by the SCORM/PDF exporters. Optimistic-locked: callers can pass `expectedVersion`, and a stale write gets a 409.
3. `scenarioDocument` (JSONB, versioned via `scenarioDocumentVersion`) — a branching node/connection graph originally consumed by the now-deleted `@xyflow/react` flow editor. **Not optimistic-locked** — see Issue #1.

`ScenarioService.buildCourseDocumentFromTree` / `buildScenarioDocumentFromTree` derive #2/#3 from #1 as a fallback when the JSONB column is empty (legacy scenarios). This three-way duplication is deliberate (comments in the code acknowledge it) but is the most likely place for future bugs — check all three representations when something "isn't saving right."

**Update from this audit: representations #1 and #3 are effectively legacy/inactive for anything created through the current app.** The live frontend (`InlineScenarioCourseEditor.tsx`) authors content exclusively through `courseDocument` — a full-text search of that component for every relational-tree call (`createModule`/`createSequence`/`createActivity`/`reorder*`) and for `updateScenarioDocument` came back with zero hits. `modules`/`sequences`/`activites` and `scenarioDocument` only get populated by the seeder, by scenarios created before this rewrite, or by direct API calls — never by the shipped UI. The branching-narrative feature also appears to have moved: rather than the node-graph, `courseDocument` now supports `choice_point` / `branching_dialogue` / `consequence` / `branch_merge` / `conditional_gate` blocks authored inline inside lessons. `getCourseReadiness()` validates the chosen content and completion settings directly; there is no course-format classification.

Lifecycle: `BROUILLON → EN_COURS_VALIDATION → APPROUVE → EXPORTE`, any state `→ ARCHIVE`, and `APPROUVE`/`EN_COURS_VALIDATION` → `BROUILLON` automatically whenever the owner edits, or explicitly on admin reject. Well covered by `scenario.service.spec.ts`.

### 3.4 Real-time collaboration

`ScenarioCollaborationGateway` (namespace `/scenario-collaboration`): JWT-authed sockets, one room per scenario, in-memory presence + per-element edit locks (plain `Map`s on the gateway instance). **Process-local** — running more than one backend replica needs a shared Socket.IO adapter and a shared lock/presence store, or collaborators on different instances won't see each other. Listens for a `share.revoked` event to kick a collaborator's socket out immediately rather than waiting for their next action.

### 3.5 Export pipeline (`scorm` module)

`scorm.service.ts` is ~4,700 lines: SCORM zip build (manifest + `buildRuntime()`, a large embedded JS player), a parallel Puppeteer/PDFKit PDF export with rendering for ~30 block types, and a separate "upload a SCORM zip and preview it" feature with solid zip-slip protection (path normalization + traversal checks in `normalizeZipEntryName` / `resolvePackageFile`). The file's size is itself a maintainability risk — splitting SCORM build, PDF build, and the upload-preview feature into separate services would help.

## 4. Frontend (`pfe-frontend/pfe`, Next.js 16 App Router + React 19)

### 4.1 Structure

- `app/` — routes: `auth/{login,register}`, `dashboard/{scenarios, scenarios/new, scenarios/[id], scenarios/[id]/edit, scorm-viewer, media, analytics, settings, users}`. That's the complete route list — checked directly.
- **Only one editor is actually live.** `/dashboard/scenarios/new` and `/dashboard/scenarios/[id]/edit` both render exactly one component: `InlineScenarioCourseEditor.tsx` (~7,300 lines, self-contained — it implements course/lesson/block building, media picking, collaborator sharing (`CollaboratorInviteControl` / `CollaboratorAccessControl`), a responsive comments drawer, and submit/approve/reject/archive actions all itself, on top of `courseEditorModel.ts` + `useCourseDocumentAutosave.ts`). New course items explicitly choose Lesson or Quiz and open directly in the relevant editor. Comments can target the course or a lesson, are filtered by open/resolved state, and support author edits plus resolution; the edit route passes the fetched `scenario.courseDocument` into the editor and shows a retry state on a failed fetch, preventing a failed load from opening a blank, editable course.
- Dead editor files were removed on 2026-09-14 after the project owner confirmed there is no revival plan. Deleted files: `CourseEngineEditor.tsx`, `ActivityEditor.tsx`, `ModuleTree.tsx`, `QuizBuilder.tsx`, `RightPanel.tsx`, `SharingPanel.tsx`, and the entire `scenario-editor/` flow-graph editor folder.
- Unused frontend API-client methods were removed with that cleanup: `getScenarioDocument`, `updateScenarioDocument`, the module/sequence/activity CRUD + reorder wrappers, change-proposal wrappers, activity-log wrapper, and `updateShare`.
- `context/` — `AuthContext` (JWT + minimal user stored in cookies via `js-cookie`, `SameSite=Strict`, `Secure` in production; cross-tab sync through `useSyncExternalStore` plus a custom `edu-auth-change` window event), `SocketContext` (Socket.IO client + a per-scenario "room" hook), `ThemeContext`, `SidebarContext`.
- `lib/api.ts` — a single axios instance; **every** backend response is normalized here (French ⇄ English field names, enum remapping, envelope handling). This is the first place to check whenever "frontend shows X but backend has Y." `scenariosApi.share()` intentionally hardcodes full co-author access because the product decision is "anyone invited is a co-author." `mediaApi.getAll()` has no scenario-scoping parameter at all (Issue #3).
- `proxy.ts` — Next 16's route-protection convention (renamed from `middleware.ts` in Next 16; verified against Next.js's own docs that a named `export function proxy(...)` at the project root, as used here, is correct and does run — no fix needed there). Redirects unauthenticated users away from `/dashboard`, non-admins away from `/dashboard/users`, and authenticated users away from `/auth/*`.
- Empty scaffolds removed on 2026-09-14: repo-root `.agents/`, frontend `action/`, and backend `src/parcours/`.

### 4.2 Course document saves

- `useCourseDocumentAutosave.ts` (**live**, used by `InlineScenarioCourseEditor.tsx`): debounced (650ms), sends `expectedVersion`, treats a 409 as a distinct `'conflict'` status and pauses further autosaves until the caller reloads or dismisses it. Correctly mirrors the backend's optimistic lock. Exposes `savedVersion` and `syncSavedDocument` to synchronize the optimistic lock counter with AI change proposal and application workflows without full-page reloads.
- The editor computes `getCourseReadiness(document)` once at the top level and passes it into both the outline/export settings, so SCORM/PDF export consistently blocks incomplete courses instead of rendering with an undefined readiness value.
- The scenario detail page now renders `courseDocument.lessons` / `courseDocument.pages` before falling back to legacy relational `modules`, so scenarios authored through the live editor no longer show an empty "Content Structure" card.

### 4.3 Sharing UI

Confirmed live inside `InlineScenarioCourseEditor.tsx` (`CollaboratorInviteControl` for adding, `CollaboratorAccessControl` for the current-access list). The UI only collects an email and calls `scenariosApi.share()`, which hardcodes `permission: 'edit'`, `role: 'co_author'`, and `canEditStructure`/`canEditContent`/`canPublish: true`. The project owner confirmed this is intentional: anyone invited is a full co-author. The unused `updateShare()` frontend wrapper was removed.

## 5. Known issues (priority order)

**1. [Medium] `scenarioDocument` (the flow-graph) has no optimistic locking**, unlike `courseDocument`. `UpdateScenarioDocumentDto` carries no version field; `updateScenarioDocument()` always overwrites unconditionally. The frontend caller was removed with the dead flow-graph editor, so this is now API-direct/legacy risk only. Fix if the endpoint stays: add `expectedVersion` to the DTO/service, mirroring `updateCourseDocument`.

**2. [Medium] Scenario view/edit authorization is implemented three separate times and has already diverged:** `ScenarioService` (scenario CRUD), `ScenarioShareService` (sharing/comments/proposals), and `ScenarioCollaborationGateway` (websocket) each have their own `assertCanView/EditScenario`. Both server-side copies have comments acknowledging the duplication and the risk. Confirmed divergence: for `scope: 'publish'`, `ScenarioService` unconditionally forbids admin edits, while `ScenarioShareService` explicitly allows admins (needed so they can approve/reject change proposals) — same scope name, opposite behavior. The gateway has no scope concept at all (`canEdit` is a single boolean, and it never checks `canPublish`). Extract one shared policy/service used by all three call sites.

**3. [Medium] `Ressource`/`Media` authorization uses a different model than everything else.** It's uploader-based (`uploadedBy === requester`), not scenario-based. A co-author with full edit rights on a shared scenario still gets a 403 opening a resource the *original owner* uploaded to that same scenario. Also, `findByScenario`/`findByModule` apply no ownership filter at all (unlike `findOne`/`update`/`remove`), so any authenticated user can already list every resource of any scenario/module regardless of uploader — the ownership check is inconsistently applied even within this one module. The frontend compounds this: `MediaPicker.tsx` (used by the live editor to attach video/file/image blocks) calls `mediaApi.getAll()` → `GET /ressources`, which the backend scopes to `uploaderId = requester`. So the picker only ever shows the current user's *own* past uploads, never a shared scenario's existing media or other collaborators' uploads. It should probably call the scenario-scoped `findByScenario` endpoint instead, but that endpoint has no authorization check at all, so fixing the picker's scoping needs to go together with adding a real permission check there.

**4. [Medium] `rapport` (reports) endpoints have no ownership check.** `findOne`, `update`, and `remove` on `RapportController` require only `AuthGuard`+`RoleGuard` with no `@Roles`, so any authenticated user can read, edit, or delete *any* rapport by id — not just their own. `create()` also never checks that `dto.userId` matches the requester, so any authenticated user can create a rapport (a score/analytics record) under someone else's id.

**5. [Low] Reorder logic is duplicated three times** (`course-module.service.ts`, `sequence.service.ts`, `activite.service.ts`): near-identical "find items by id within the parent scope → verify the count matches → transactionally update `ordre`." Worth extracting into one shared helper. This code is currently only exercised by legacy/API-direct scenarios, not the live UI — still worth fixing since the endpoints remain part of the public API.

**6. [Low] `GET /scorm/uploads/:packageId/viewer` has no auth guard**, unlike its siblings (`upload`, `GET /scorm/uploads/:packageId`). Mitigated by `packageId` being a random UUID, but inconsistent. Also worth confirming: no cleanup/TTL was found for packages uploaded through `/scorm/upload` — possible unbounded disk growth over time.

## 6. Settled decisions and open questions

- Settled on 2026-09-14: always-full-access sharing is intentional; anyone invited is a co-author. Keep `scenariosApi.share()` full-access unless the product decision changes.
- Settled on 2026-09-14: remove dead frontend editor code and empty scaffolds. Done for `scenario-editor/*`, `CourseEngineEditor.tsx`, `ActivityEditor.tsx`, `ModuleTree.tsx`, `QuizBuilder.tsx`, `RightPanel.tsx`, `SharingPanel.tsx`, frontend `action/`, backend `src/parcours/`, and root `.agents/`.
- Settled on 2026-09-14: keep `@cerebras/cerebras_cloud_sdk`; it is reserved for planned AI course generation.
- Settled on 2026-09-15: AI generation uses Groq's hosted `openai/gpt-oss-20b` through the backend-only `ai-course` module. The unused Cerebras dependency remains until a separate dependency cleanup confirms no deployment relies on it. AI proposals are explicit, version-locked `AiChangeSet` records and can edit course, lesson, or block content without replacing content automatically.
- Still open: whether backend `scenarioDocument` and the relational tree endpoints should remain as legacy/API-direct support or be deprecated in favor of `courseDocument` only.

## 7. Audit coverage (read before assuming something wasn't checked)

**Read in full**, and reflected above: every backend `src/` module — every controller, service, entity, DTO, and spec file — plus root configs (`package.json` ×3, `AGENTS.md`, `scripts/dev.mjs`). On the frontend: `lib/api.ts`, `lib/auth.ts`, `context/AuthContext.tsx` and the rest of `context/*`, `types/index.ts`, `proxy.ts`, `next.config.ts`, `app/layout.tsx`, every `app/**/page.tsx` route, `Sidebar.tsx`, `useCourseDocumentAutosave.ts`, `courseEditorModel.ts`, `ressource.controller.ts`/`ressource.service.ts`, `role.entity.ts`/`role.guard.ts`/`role.decorator.ts`, and the live `_components/MediaPicker.tsx`. `InlineScenarioCourseEditor.tsx` (~7,300 lines) was audited via a full-text search of every backend-facing call site (every `scenariosApi`/`mediaApi`/`usersApi`/`scormApi` call, sharing/comments/proposal/activity-log usage) plus close reading of its save/lock logic — not every UI-rendering line was read, but every place it talks to the backend was checked.

**Deleted after confirmed dead / unreachable**: `SharingPanel.tsx`, `ActivityEditor.tsx`, `CourseEngineEditor.tsx`, `ModuleTree.tsx`, `QuizBuilder.tsx`, `RightPanel.tsx`, and all 9 files under `scenario-editor/`.

**Still not read**: `components/ui/*` (presentational primitives — Button, Input, Modal, Card, Spinner, Badge, Avatar, etc. — low audit value, only seen via their usage in other files), `components/layout/Topbar.tsx` and `SidebarToggleButton.tsx`, and roughly half of `scorm.service.ts` (its PDF-block-rendering and embedded-runtime code — method signatures were catalogued, not every body was read). Nothing in the unread portions looked structurally alarming from what *was* visible, but treat that section as unverified until someone reads it.

## 8. Keeping this current

Update the relevant section above whenever a module gets touched, instead of appending a changelog entry. When a §5 issue gets fixed, move it out of "Known issues" rather than marking it done in place.
