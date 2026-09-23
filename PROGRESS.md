# Improvement Suggestions — Execution Progress

> Tracking file. Updated as tasks are completed.

## Phase 0 — Manual Tasks (Do Yourself / Zero AI Cost)

| # | Task | Status | Notes |
|---|---|---|---|
| 19 | Remove dead `@xyflow/react` | ✅ DONE| `npm uninstall @xyflow/react` in pfe-frontend/pfe |
| 22 | Content-Security-Policy header | ✅ DONE| Edit `next.config.ts` |
| 10 | Config-driven AI model name | ✅ DONE| Add to `.env`, update `ai-course.service.ts` |
| 20 | GIN index on `courseDocument` | ✅ DONE| Add decorator to `scenario.entity.ts` |
| 9  | Deprecate legacy endpoints | ✅ DONE| Add `@ApiOperation({ deprecated: true })` to controllers |
| 18 | Env validation at boot | ✅ DONE| Update `app.module.ts` with Joi schema |
| 13 | Optimistic lock on `scenarioDocument` | ✅ DONE| Update `scenario.service.ts` + DTO |

## Phase 1 — Session A: Security Fixes on Small Files

| # | Task | Status | Notes |
|---|---|---|---|
| 2  | Fix rapport auth | ✅ DONE| `rapport.controller.ts` + `rapport.service.ts` |
| 4  | @SkipThrottle on GET endpoints | ✅ DONE| 6 controllers |
| 5  | Auth guard on SCORM viewer | ✅ DONE| `scorm.controller.ts` |

## Phase 2 — Session B: Unified Auth Policy

| # | Task | Status | Notes |
|---|---|---|---|
| 1  | Unify `assertCanView/EditScenario` | ✅ DONE| Create `ScenarioAccessPolicy` service |

## Phase 3 — Session C: Media Auth Fix

| # | Task | Status | Notes |
|---|---|---|---|
| 3  | Fix media auth + picker scope | ✅ DONE | `ressource.service.ts`, `ressource.controller.ts`, `MediaPicker.tsx`, `api.ts` |

## Phase 4 — Session D: Backend Infrastructure

| # | Task | Status | Notes |
|---|---|---|---|
| 7  | Extract reorder utility | ✅ DONE | Create `src/common/utils/reorder.util.ts` |
| 8  | SCORM upload TTL cleanup | ✅ DONE | Create `scorm-cleanup.service.ts` |
| 12 | Redis adapter for Socket.IO | ✅ DONE | Update `scenario-collaboration.module.ts` + `main.ts` |
| 11 | HttpOnly cookie for JWT | ✅ DONE | Update `auth.service.ts` + `lib/auth.ts` |

## Phase 5 — Session E: Frontend Types & Data Layer

| # | Task | Status | Notes |
|---|---|---|---|
| 15 | Zod parse API responses | ✅ DONE | Create `lib/schemas.ts`, update `api.ts`. **Reworked in Session G:** the first version never built (syntax error, `getApiErrorMessage` dropped, missing parse exports) and would have broken the app at runtime (arrays wrapped as objects, strict schemas throwing). Zod is now advisory: `api.ts` returns raw `response.data` and schemas only log a dev warning on mismatch. Schemas still don't match the real backend shapes (e.g. lowercase `statut`, numeric ids) — tighten later; the exported `Backend*Schema` consts are the unwired start of that work |
| 16 | React Query for editor fetch | ✅ DONE | Already done: `edit/page.tsx` uses `useQuery(['scenario', id])`; `queryClient.ts` + `Providers.tsx` wired |
| 17 | Discriminated union block types | ✅ DONE | `CourseBlock` is now a mapped discriminated union in `types/index.ts`; `CourseBlockOfType<T>` exposes concrete variants while preserving valid partially-authored blocks. |

## Phase 6 — Session F: Split `scorm.service.ts`

| # | Task | Status | Notes |
|---|---|---|---|
| 6a | Split out `scorm-preview.service.ts` | ✅ DONE | Uploaded-package handling (16 methods, ~370 lines) extracted. No repo/ScenarioService dep. Module + controller + spec + cleanup constants rewired |
| 6b | Split out `scorm-pdf.service.ts` | ✅ DONE | Puppeteer PDF generation and its rendering helpers extracted; retired PDFKit renderer and dependency removed |
| 6c | Split out `scorm-build.service.ts` | ✅ DONE | SCORM zip assembly, manifest, and embedded player runtime extracted |

**Shared by both pdf + build** — `scorm-export.base.ts`:
`normalizeCourseForExport`, `normalizeQuiz`, `normalizeQuizQuestion`, `normalizeQuizQuestionType`, `quizQuestionsFromBlocks`, `ensureExportPages`, `lessonToPage`, `buildStylesheet`, `sortScenarioTree`, `escHtml`.

## Phase 7 — Session G: Split `InlineScenarioCourseEditor.tsx`

| # | Task | Status | Notes |
|---|---|---|---|
| 14 | Split editor mega-component | ✅ DONE | Split applied via `scripts/split-inline-editor/` (original preserved in `backups/`). Main file is now a ~19 KB shell + 6 hooks in `hooks/`, shared non-React modules in `shared/`, and components grouped under `blocks/`/`course/`/`lesson/`/`quiz/`/`preview/`/`collaboration/`. **`npm run build` and `npm run lint` both pass clean (0 errors, 0 warnings).** Final fix was task-15 fallout, not the split: `scenarios/page.tsx` imported a `PaginatedScenarios` type that `lib/api.ts` never exported — added `Paginated<T>` + `PaginatedScenarios`/`PaginatedMedia` there. Lint cleanup: removed an unused `index` arg in `AiCourseControls.tsx`, exported the 6 dead `Backend*Schema` consts in `lib/schemas.ts` (kept for the later schema tightening), and added a `^_` ignore pattern for `no-unused-vars` to `eslint.config.mjs` (covers the deliberate `_deprecatedFormat` discard). `ARCHITECTURE.md` §4.1 and §7 updated |

## Phase 8 — Session H: Additional

| # | Task | Status | Notes |
|---|---|---|---|
| 21 | E2E test for optimistic lock | ⬜ TODO | Add Supertest e2e test |
| 23 | Fix admin instant-logout (duplicate global `RoleGuard`) | ✅ DONE | `app.module.ts` — removed the redundant `APP_GUARD` registration of `RoleGuard`. Global guards run before controller-scoped ones, so this copy fired before the controller-scoped `AuthGuard` on every `@Roles()` route, before `request.decodedData` was ever set — 401'd unconditionally, valid token or not. Controllers already declare the correct order (`@UseGuards(AuthGuard, RoleGuard)`), so deleting the global copy was the fix. A prior session had diagnosed this correctly but only printed the diff as text — it was never actually written to `app.module.ts`, which is why the bug persisted. |
| 24 | Fix broken admin Users page (`/dashboard/users`) | ✅ DONE | `lib/api.ts` — `GET /users` and the single-user write endpoints return raw TypeORM entities: `role` is the full `{id, name}` relation (not the flat `'ADMIN'\|'EDUCATOR'` string `User`/`UsersPage` assume), and the join date is `dateInscription`, not `createdAt`. `usersApi.getAll/create/update/updateRole` were unwrapped or only `checked()` (advisory-only — validates but never replaces the data), so the raw shape reached the page unchanged. Actual crash: `<StatusBadge status={user.role} />` (`components/ui/Badge.tsx`) got handed an object — React throws rendering an object as a child. Also silently zeroed `adminCount`/`isLastAdmin`, disabling the last-admin delete/demote protection, since `user.role === 'ADMIN'` never matches an object. Fix reuses `normalizeUser` (`lib/auth.ts`, already proven via the login/session flow) through a new `transformed()` call instead of duplicating the mapping. Not build/type-checked here (no execution access to the user's machine) — worth a `npm run build` / `tsc` pass to confirm. |
| 25 | Fix dashboard "Scenario pipeline" / "Platform status mix" always showing 0 | ✅ DONE | `app/dashboard/page.tsx` — same root cause as task 24: the backend only ever returns `statut` (lowercase, e.g. `'brouillon'`); `status` is never populated despite the `Scenario` type saying otherwise. The overview page's pipeline breakdown and its Approved/In review/Draft summary cards compared straight against `scenario.status`, which is always `undefined`, so every bucket read 0 and the status-mix bar rendered empty regardless of real data. Reused the `String(scenario.status ?? scenario.statut ?? '').toUpperCase()` normalization already proven in `dashboard/scenarios/page.tsx`, via a new `scenarioStatusOf()` helper applied everywhere this page reads status: the three count metrics, the pipeline breakdown, and the "Recent scenarios" badges/permission checks. Also fixed a related bug in the same "revert approved scenario to draft" click handler: it sent `{ statut: 'BROUILLON' }` (uppercase), which fails the backend's `@IsEnum(StatutScenario)` validation (real enum values are lowercase) and always errored with "Unable to move this scenario back to draft."; changed to `{ statut: 'brouillon' }`. Not build/type-checked here (no execution access to the user's machine) — worth a `npm run build` / `tsc` pass to confirm. |

---

## Legend
- ⬜ TODO
- 🔄 IN PROGRESS
- ✅ DONE
- ❌ SKIPPED / N/A
