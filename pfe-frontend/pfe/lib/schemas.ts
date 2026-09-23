import { z } from 'zod';

// Base schemas with transformation from backend format
export const UserSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string().email(),
  role: z.string().nullable(),
}).transform((data) => ({
  id: data.id,
  firstName: data.firstName,
  lastName: data.lastName,
  email: data.email,
  role: data.role,
}));

export const ActivityTypeSchema = z.enum(['TEXT', 'QUIZ', 'VIDEO', 'FILE', 'LINK']);
export const QuestionTypeSchema = z.enum(['TRUE_FALSE', 'MCQ']);
export const MediaTypeSchema = z.enum(['IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT']);
export const ScenarioStatusSchema = z.enum(['BROUILLON', 'EN_COURS_VALIDATION', 'APPROUVE', 'EXPORTE', 'ARCHIVE']);
export const CourseTeamRoleSchema = z.enum(['OWNER', 'CO_AUTHOR', 'REVIEWER']);

// Helper schemas for transformation
const BackendUserSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string().email(),
  role: z.string().nullable(),
  // Backend might have different field names
  nom: z.string().optional(),
  prenom: z.string().optional(),
  // Handle potential variations
}).transform((data) => ({
  id: data.id,
  firstName: data.prenom ?? data.firstName,
  lastName: data.nom ?? data.lastName,
  email: data.email,
  role: data.role,
}));

// Activity schemas with transformation
const BackendQuizSchema = z.object({
  id: z.string(),
  titre: z.string(),
  scorePourReussir: z.number().int().nonnegative(),
  tentatives: z.number().int().nonnegative().optional(),
  activiteId: z.string().optional(),
}).transform((data) => ({
  id: data.id,
  title: data.titre,
  passingScore: data.scorePourReussir,
  attempts: data.tentatives,
  activityId: data.activiteId,
}));

export const QuizSchema = z.object({
  id: z.string(),
  title: z.string(),
  passingScore: z.number().int().nonnegative(),
  attempts: z.number().int().nonnegative().optional(),
  activityId: z.string().optional(),
});

const BackendActivitySchema = z.object({
  id: z.string(),
  titre: z.string().optional(),
  title: z.string().optional(),
  type: z.string(),
  consigne: z.string().optional(),
  content: z.string().optional(),
  media: z.string().optional(),
  mediaUrl: z.string().optional(),
  url: z.string().optional(),
  duree: z.number().int().nonnegative().optional(),
  duration: z.number().int().nonnegative().optional(),
  points: z.number().int().nonnegative().optional(),
  ordre: z.number().int(),
  order: z.number().int(),
  quiz: z.lazy(() => BackendQuizSchema).optional(),
}).transform((data) => ({
  id: data.id,
  title: data.titre ?? data.title ?? 'Untitled activity',
  type: data.type,
  content: data.consigne ?? data.content ?? undefined,
  mediaUrl: data.media ?? data.mediaUrl ?? data.url ?? undefined,
  duration: data.duree ?? data.duration ?? undefined,
  points: data.points ?? undefined,
  order: data.ordre ?? data.order,
  quiz: data.quiz,
}));

export const ActivitySchema = z.object({
  id: z.string(),
  title: z.string(),
  type: ActivityTypeSchema,
  content: z.string().optional(),
  mediaUrl: z.string().optional(),
  duration: z.number().int().nonnegative().optional(),
  points: z.number().int().nonnegative().optional(),
  order: z.number().int(),
  quiz: QuizSchema.optional(),
});

// Sequence schemas with transformation
const BackendSequenceSchema = z.object({
  id: z.string(),
  titre: z.string().optional(),
  title: z.string().optional(),
  texte: z.string().optional(),
  description: z.string().optional(),
  ordre: z.number().int(),
  order: z.number().int(),
  activites: z.array(z.lazy(() => BackendActivitySchema)),
  activities: z.array(z.lazy(() => BackendActivitySchema)),
}).transform((data) => ({
  id: data.id,
  title: data.titre ?? data.title ?? 'Untitled sequence',
  description: data.texte ?? data.description ?? undefined,
  order: data.ordre ?? data.order,
  activities: data.activites ?? data.activities,
}));

export const SequenceSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  order: z.number().int(),
  activities: z.array(ActivitySchema),
});

// Module schemas with transformation
const BackendScenarioModuleSchema = z.object({
  id: z.string(),
  titre: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  ordre: z.number().int(),
  order: z.number().int(),
  sequences: z.array(z.lazy(() => BackendSequenceSchema)),
}).transform((data) => ({
  id: data.id,
  title: data.titre ?? data.title ?? 'Untitled module',
  description: data.description ?? undefined,
  order: data.ordre ?? data.order,
  sequences: data.sequences,
}));

export const ScenarioModuleSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  order: z.number().int(),
  sequences: z.array(SequenceSchema),
});

// Backend-shaped schemas (lowercase `statut`, `titre`, `dateCreation`, ...).
// Not wired into any parser yet — the active parsers stay advisory until the
// frontend schemas are tightened against what the API really returns.
// Exported so they stay reachable for that follow-up.
export const BackendScenarioSchema = z.object({
  id: z.string(),
  titre: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  objectif: z.string().optional(),
  niveau: z.string().optional(),
  dureeScenario: z.number().int().nonnegative().optional(),
  courseDocument: z.any().optional(),
  courseDocumentVersion: z.number().int().nonnegative().optional(),
  scenarioDocument: z.any().optional(),
  scenarioDocumentVersion: z.number().int().nonnegative().optional(),
  statut: z.string(),
  status: z.string(),
  isPublic: z.boolean().optional(),
  author: z.lazy(() => BackendUserSchema).nullable(),
  ownerId: z.string().optional(),
  ownerName: z.string().optional(),
  modules: z.array(z.lazy(() => BackendScenarioModuleSchema)),
  shares: z.array(z.lazy(() => z.any())), // Will refine
  dateCreation: z.string().datetime(),
  createdAt: z.string().datetime(),
  dateModification: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
}).transform((data) => {
  // Status mapping
  const statusMap: Record<string, z.infer<typeof ScenarioStatusSchema>> = {
    brouillon: 'BROUILLON',
    en_cours_validation: 'EN_COURS_VALIDATION',
    approuve: 'APPROUVE',
    exporte: 'EXPORTE',
    archive: 'ARCHIVE',
    DRAFT: 'BROUILLON',
    PUBLISHED: 'APPROUVE',
    EXPORTED: 'EXPORTE',
    ARCHIVED: 'ARCHIVE',
  };

  const normalizedStatus = statusMap[data.statut?.toLowerCase() ?? data.status?.toLowerCase() ?? ''] ?? 'BROUILLON';

  return {
    id: data.id,
    title: data.titre ?? data.title ?? 'Untitled scenario',
    titre: data.titre ?? data.title ?? 'Untitled scenario',
    description: data.description ?? undefined,
    objectif: data.objectif ?? undefined,
    niveau: data.niveau ?? undefined,
    dureeScenario: data.dureeScenario ?? undefined,
    courseDocument: data.courseDocument ?? undefined,
    courseDocumentVersion: data.courseDocumentVersion ?? undefined,
    scenarioDocument: data.scenarioDocument ?? undefined,
    scenarioDocumentVersion: data.scenarioDocumentVersion ?? undefined,
    status: normalizedStatus,
    statut: normalizedStatus,
    template: 'BLANK',
    isPublic: data.isPublic ?? false,
    author: data.author,
    ownerId: data.ownerId,
    ownerName: data.ownerName,
    modules: data.modules ?? [],
    shares: data.shares ?? [],
    createdAt: data.dateCreation ?? data.createdAt ?? new Date().toISOString(),
    dateCreation: data.dateCreation ?? data.createdAt ?? new Date().toISOString(),
    updatedAt: data.updatedAt ?? data.dateModification ?? data.createdAt ?? new Date().toISOString(),
  };
});

export const ScenarioSchema = z.object({
  id: z.string(),
  title: z.string(),
  titre: z.string(),
  description: z.string().optional(),
  objectif: z.string().optional(),
  niveau: z.string().optional(),
  dureeScenario: z.number().int().nonnegative().optional(),
  courseDocument: z.any().optional(),
  courseDocumentVersion: z.number().int().nonnegative().optional(),
  scenarioDocument: z.any().optional(),
  scenarioDocumentVersion: z.number().int().nonnegative().optional(),
  status: ScenarioStatusSchema,
  statut: ScenarioStatusSchema,
  template: z.string().default('BLANK'),
  isPublic: z.boolean(),
  author: UserSchema.nullable(),
  ownerId: z.string().optional(),
  ownerName: z.string().optional(),
  modules: z.array(ScenarioModuleSchema),
  shares: z.array(z.any()), // Will define separately
  createdAt: z.string().datetime(),
  dateCreation: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

// Share schemas with transformation
export const BackendScenarioShareSchema = z.object({
  id: z.string(),
  user: z.lazy(() => BackendUserSchema),
  permission: z.string(),
  role: z.string(),
  canEditStructure: z.boolean().optional(),
  canEditContent: z.boolean().optional(),
  canPublish: z.boolean().optional(),
  dateCreation: z.string().datetime(),
  sharedAt: z.string().datetime(),
  createdAt: z.string().datetime(),
}).transform((data) => {
  const permissionMap: Record<string, 'EDIT' | 'READ'> = {
    edit: 'EDIT',
    read: 'READ',
  };

  const roleMap: Record<string, z.infer<typeof CourseTeamRoleSchema>> = {
    co_author: 'CO_AUTHOR',
    owner: 'OWNER',
    reviewer: 'REVIEWER',
  };

  return {
    id: data.id,
    user: data.user,
    permission: permissionMap[data.permission?.toLowerCase() ?? 'read'] ?? 'READ',
    role: roleMap[data.role?.toLowerCase() ?? 'reviewer'] ?? 'REVIEWER',
    canEditStructure: data.canEditStructure ?? false,
    canEditContent: data.canEditContent ?? false,
    canPublish: data.canPublish ?? false,
    createdAt: data.dateCreation ?? data.sharedAt ?? data.createdAt ?? new Date().toISOString(),
  };
});

export const ScenarioShareSchema = z.object({
  id: z.string(),
  user: UserSchema,
  permission: z.enum(['EDIT', 'READ']),
  role: CourseTeamRoleSchema,
  canEditStructure: z.boolean(),
  canEditContent: z.boolean(),
  canPublish: z.boolean(),
  createdAt: z.string().datetime(),
});

// Comment schemas with transformation
export const BackendScenarioCommentSchema = z.object({
  id: z.string(),
  targetType: z.string(),
  targetId: z.string().optional(),
  body: z.string(),
  mentions: z.array(z.string()),
  status: z.string(),
  author: z.lazy(() => BackendUserSchema),
  dateCreation: z.string().datetime(),
  createdAt: z.string().datetime(),
  dateModification: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
  dateResolution: z.string().datetime().optional(),
  resolvedAt: z.string().datetime().optional(),
}).transform((data) => ({
  id: data.id,
  targetType: data.targetType ?? 'course',
  targetId: data.targetId ?? undefined,
  body: data.body ?? '',
  mentions: data.mentions ?? [],
  status: data.status?.toLowerCase() === 'resolved' ? 'resolved' : 'open',
  author: data.author,
  createdAt: data.dateCreation ?? data.createdAt ?? new Date().toISOString(),
  updatedAt: data.dateModification ?? data.updatedAt ?? new Date().toISOString(),
  resolvedAt: data.dateResolution ?? data.resolvedAt ?? undefined,
}));

export const ScenarioCommentSchema = z.object({
  id: z.string(),
  targetType: z.string(),
  targetId: z.string().optional(),
  body: z.string(),
  mentions: z.array(z.string()),
  status: z.enum(['resolved', 'open']),
  author: UserSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  resolvedAt: z.string().datetime().optional(),
});

// Notification schemas with transformation
export const BackendScenarioNotificationSchema = z.object({
  id: z.string(),
  message: z.string(),
  scenarioId: z.string(),
  scenarioTitle: z.string(),
  dateCreation: z.string().datetime(),
  createdAt: z.string().datetime(),
}).transform((data) => ({
  id: data.id ?? z.string().uuid().parse('00000000-0000-0000-0000-000000000000'), // Fallback
  message: data.message ?? '',
  scenarioId: data.scenarioId ?? '',
  scenarioTitle: data.scenarioTitle ?? 'Untitled scenario',
  createdAt: data.dateCreation ?? data.createdAt ?? new Date().toISOString(),
}));

export const ScenarioNotificationSchema = z.object({
  id: z.string(),
  message: z.string(),
  scenarioId: z.string(),
  scenarioTitle: z.string(),
  createdAt: z.string().datetime(),
});

// Media schemas with transformation
export const BackendMediaAssetSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  filename: z.string().nullish(),
  originalName: z.string().nullish(),
  titre: z.string().nullish(),
  mimetype: z.string().nullish(),
  taille: z.number().int().nonnegative().nullish(),
  size: z.number().int().nonnegative().nullish(),
  url: z.string().nullish(),
  type: z.string().nullish(),
  tags: z.array(z.string()).nullish(),
  dateCreation: z.string().nullish(),
  createdAt: z.string().nullish(),
}).transform((data) => {
  // Determine media type from filename/mimetype/url if not provided
  const typeFromFile = (filename: string | undefined) => {
    if (!filename) return undefined;
    const ext = filename.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'png':
      case 'jpg':
      case 'jpeg':
      case 'gif':
      case 'webp':
      case 'svg':
        return 'IMAGE';
      case 'mp4':
      case 'webm':
      case 'mov':
      case 'avi':
        return 'VIDEO';
      case 'mp3':
      case 'wav':
      case 'ogg':
      case 'm4a':
        return 'AUDIO';
      default:
        return undefined;
    }
  };

  // The backend's own resource-type enum is lowercase and uses 'mass' as
  // legacy naming for images ('video' / 'audio' / 'document' / 'discussion'
  // are the others). Normalize it into the frontend's MediaType enum first,
  // and only fall back to sniffing the file extension when that's missing
  // or unrecognized.
  const backendTypeMap: Record<string, z.infer<typeof MediaTypeSchema>> = {
    mass: 'IMAGE',
    image: 'IMAGE',
    video: 'VIDEO',
    audio: 'AUDIO',
    document: 'DOCUMENT',
    discussion: 'DOCUMENT',
    IMAGE: 'IMAGE',
    VIDEO: 'VIDEO',
    AUDIO: 'AUDIO',
    DOCUMENT: 'DOCUMENT',
  };

  const determinedType =
    (data.type ? backendTypeMap[data.type] : undefined) ||
    typeFromFile(data.filename ?? undefined) ||
    typeFromFile(data.originalName ?? undefined) ||
    (data.url ? typeFromFile(data.url.split('/').pop()) : undefined) ||
    'DOCUMENT'; // Default to document

  return {
    id: data.id,
    filename: data.filename ?? data.originalName ?? data.titre ?? 'Untitled file',
    originalName: data.originalName ?? data.filename ?? data.titre ?? 'Untitled file',
    mimetype: data.mimetype ?? '',
    size: data.taille ?? data.size ?? 0,
    url: data.url ?? '',
    type: determinedType as z.infer<typeof MediaTypeSchema>,
    tags: data.tags ?? [],
    createdAt: data.dateCreation ?? data.createdAt ?? new Date().toISOString(),
  };
});

export const MediaAssetSchema = z.object({
  id: z.string(),
  filename: z.string(),
  originalName: z.string(),
  mimetype: z.string(),
  size: z.number().int().nonnegative(),
  url: z.string(),
  type: MediaTypeSchema,
  tags: z.array(z.string()),
  createdAt: z.string().datetime(),
});

// The `/ressources` list endpoints (mediaApi.getAll / getByScenario) return a
// bare array of backend-shaped resources, not the `{ items, total, page,
// limit }` envelope PaginatedMediaSchema below describes. Parse the array
// with BackendMediaAssetSchema so every item is actually translated (lowercase
// backend `type`, `titre`/`taille` field names, ...) into the frontend
// MediaAsset shape, instead of being checked against a schema it can never
// match.
export const BackendMediaListSchema = z.array(BackendMediaAssetSchema);

// Paginated response schemas
export const PaginatedScenariosSchema = z.object({
  items: z.array(ScenarioSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().nonnegative(),
  limit: z.number().int().nonnegative(),
}).transform((data) => ({
  items: data.items,
  total: data.total,
  page: data.page,
  limit: data.limit,
}));

export const PaginatedUsersSchema = z.object({
  items: z.array(UserSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().nonnegative(),
  limit: z.number().int().nonnegative(),
});

export const PaginatedMediaSchema = z.object({
  items: z.array(MediaAssetSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().nonnegative(),
  limit: z.number().int().nonnegative(),
});

// AI Course schemas (keeping flexible for now)
export const AiCourseBriefSchema = z.any();
export const AiCourseOutlineSchema = z.any();
export const AiChangeSetSchema = z.any();

// CourseDocument and ScenarioDocument schemas (complex, keeping flexible)
export const CourseDocumentSchema = z.any();
export const ScenarioDocumentSchema = z.any();

// Shape of an answer inside a backend question's `reponses` array
type BackendAnswer = {
  texte?: string;
  text?: string;
  option?: string;
  estCorrect?: boolean;
  isCorrect?: boolean;
};

// Quiz schemas with transformation
const BackendQuestionSchema = z.object({
  id: z.string(),
  text: z.string().optional(),
  titre: z.string().optional(),
  texte: z.string().optional(),
  type: z.string(),
  options: z.array(z.string()),
  reponses: z.array(z.any()).optional(),
  correctAnswer: z.string().optional(),
  points: z.number().int().nonnegative().optional(),
}).transform((data) => {
  // Extract options from reponses if options not provided
  const options = data.options ??
    (data.reponses ?
      data.reponses.map((r: BackendAnswer) => r.texte ?? r.text ?? r.option ?? '').filter(Boolean) :
      []);

  // Extract correct answer from reponses if not provided
  const correctAnswer = data.correctAnswer ??
    (data.reponses ?
      (data.reponses.find((r: BackendAnswer) => r.estCorrect === true || r.isCorrect === true) ?? {}).texte ??
      (data.reponses.find((r: BackendAnswer) => r.estCorrect === true || r.isCorrect === true) ?? {}).text ??
      (data.reponses.find((r: BackendAnswer) => r.estCorrect === true || r.isCorrect === true) ?? {}).option ??
      '' :
    '');

  return {
    id: data.id,
    text: data.text ?? data.titre ?? data.texte ?? '',
    type: data.type === 'vrai_faux' || data.type === 'TRUE_FALSE' ? 'TRUE_FALSE' : 'MCQ',
    options: options,
    correctAnswer: correctAnswer,
    points: data.points ?? undefined,
  };
});

export const QuestionSchema = z.object({
  id: z.string(),
  text: z.string(),
  type: QuestionTypeSchema,
  options: z.array(z.string()),
  correctAnswer: z.string(),
  points: z.number().int().nonnegative().optional(),
});

export const BackendQuizResponseSchema = z.object({
  id: z.string(),
  titre: z.string().optional(),
  title: z.string().optional(),
  questions: z.array(z.lazy(() => BackendQuestionSchema)),
  scorePourReussir: z.number().int().nonnegative().optional(),
  passingScore: z.number().int().nonnegative().optional(),
  tentatives: z.number().int().nonnegative().optional(),
  activiteId: z.string().optional(),
  activityId: z.string().optional(),
}).transform((data) => ({
  id: data.id,
  title: data.titre ?? data.title ?? 'Quiz',
  questions: data.questions ?? [],
  passingScore: data.scorePourReussir ?? data.passingScore ?? 70,
  attempts: data.tentatives ?? data.activityId ?? undefined,
  activityId: data.activityId ?? data.activiteId ?? undefined,
}));

export const QuizResponseSchema = z.object({
  id: z.string(),
  title: z.string(),
  questions: z.array(QuestionSchema),
  passingScore: z.number().int().nonnegative(),
  attempts: z.number().int().nonnegative().optional(),
  activityId: z.string().optional(),
});

// Uploaded SCORM package schema
export const UploadedScormPackageSchema = z.object({
  id: z.string(),
  filename: z.string(),
  // Add other fields as needed based on actual usage
});

// Request/response wrapper schemas
export const ApiResponseSchema = z.object({
  success: z.boolean(),
  data: z.unknown(),
  message: z.string().optional(),
});

// Error response schema
export const ApiErrorSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  errorCode: z.string().optional(),
  details: z.unknown().optional(),
});

// Helper functions to create typed parsers
export const createSchemaParser = <T>(schema: z.ZodType<T>) => {
  return (data: unknown): T => {
    const result = schema.safeParse(data);
    if (!result.success) {
      // Validation is advisory: hand the raw payload back so callers keep working
      // even when a schema is stricter than what the backend actually sends.
      if (process.env.NODE_ENV !== 'production') {
        const issue = result.error.issues[0];
        console.warn(
          `[schemas] API response does not match its schema: ${issue?.path.join('.') || '(root)'} - ${issue?.message ?? 'unknown issue'}`,
        );
      }
      return data as T;
    }
    return result.data;
  };
};

// Export parsers for common types
export const parseUser = createSchemaParser(UserSchema);
export const parseActivity = createSchemaParser(ActivitySchema);
export const parseSequence = createSchemaParser(SequenceSchema);
export const parseScenarioModule = createSchemaParser(ScenarioModuleSchema);
export const parseScenario = createSchemaParser(ScenarioSchema);
export const parseScenarioShare = createSchemaParser(ScenarioShareSchema);
export const parseScenarioComment = createSchemaParser(ScenarioCommentSchema);
export const parseScenarioNotification = createSchemaParser(ScenarioNotificationSchema);
// Parses the raw backend resource (lowercase `type`, `titre`/`taille`, ...)
// straight into a frontend MediaAsset. Only ever called on raw API responses,
// never on already-transformed data, so it must use BackendMediaAssetSchema
// (which transforms) rather than MediaAssetSchema (which only validates).
export const parseMediaAsset = createSchemaParser(BackendMediaAssetSchema);
export const parseMediaList = createSchemaParser(BackendMediaListSchema);
export const parseQuestion = createSchemaParser(QuestionSchema);
export const parseQuiz = createSchemaParser(QuizResponseSchema);
export const parseUploadedScormPackage = createSchemaParser(UploadedScormPackageSchema);
export const parseAiCourseBrief = createSchemaParser(AiCourseBriefSchema);
export const parseAiCourseOutline = createSchemaParser(AiCourseOutlineSchema);
export const parseAiChangeSet = createSchemaParser(AiChangeSetSchema);
export const parseCourseDocument = createSchemaParser(CourseDocumentSchema);
export const parseScenarioDocument = createSchemaParser(ScenarioDocumentSchema);

// Paginated parsers
export const parsePaginatedScenarios = createSchemaParser(PaginatedScenariosSchema);
export const parsePaginatedUsers = createSchemaParser(PaginatedUsersSchema);
export const parsePaginatedMedia = createSchemaParser(PaginatedMediaSchema);