import { normalizeEmail } from './webhook.service';

export const LEVEL_CODE_ALIASES: Record<string, CatalogLevelCode> = {
  ini: 'INI',
  iniciante: 'INI',
  int: 'INT',
  intermediario: 'INT',
  adv: 'ADV',
  avancado: 'ADV',
  pro: 'PRO',
  profissional: 'PRO',
  mas: 'MAS',
  maestria: 'MAS'
};

export type CatalogLevelCode = 'INI' | 'INT' | 'ADV' | 'PRO' | 'MAS';

export interface CatalogMentorRow {
  id: string;
  slug: string;
  name: string;
  active: boolean;
}

export interface CatalogCustomerRow {
  id: string;
}

export interface CatalogLevelRow {
  id: string;
  code: CatalogLevelCode;
  name: string;
  order_index: number;
}

export interface CatalogModuleRow {
  id: string;
  level_id: string;
  module_code: string;
  title: string;
  order_index: number;
}

export interface CatalogLessonRow {
  id: string;
  level_id: string;
  module_id: string;
  lesson_code: string;
  title: string;
  order_index: number;
  is_extra: boolean;
}

export interface CatalogCheckpointRow {
  id: string;
  level_id: string;
  module_id: string;
  checkpoint_code: string;
  title: string;
  order_index: number;
}

export interface CatalogProjectRow {
  id: string;
  level_id: string;
  module_id: string;
  project_code: string;
  title: string;
  project_type: string;
  order_index: number;
}

export interface LessonProgressRow {
  lesson_id: string;
  is_opened: boolean;
  is_completed: boolean;
}

export interface CheckpointProgressRow {
  checkpoint_id: string;
  is_opened: boolean;
  is_completed: boolean;
}

export interface ProjectProgressRow {
  project_id: string;
  is_opened: boolean;
  is_completed: boolean;
}

export interface CatalogServiceDeps {
  findActiveMentorBySlug(mentorSlug: string): Promise<CatalogMentorRow | null>;
  findCustomerByEmail(email: string): Promise<CatalogCustomerRow | null>;
  listActiveLevelsByMentorId(mentorId: string): Promise<CatalogLevelRow[]>;
  listActiveModulesByMentorId(mentorId: string, levelIds: string[]): Promise<CatalogModuleRow[]>;
  listPublishedLessonsByMentorId(mentorId: string, levelIds: string[], moduleIds: string[]): Promise<CatalogLessonRow[]>;
  listPublishedCheckpointsByMentorId(mentorId: string, levelIds: string[], moduleIds: string[]): Promise<CatalogCheckpointRow[]>;
  listPublishedProjectsByMentorId(mentorId: string, levelIds: string[], moduleIds: string[]): Promise<CatalogProjectRow[]>;
  listLessonProgress(customerId: string, lessonIds: string[]): Promise<LessonProgressRow[]>;
  listCheckpointProgress(customerId: string, checkpointIds: string[]): Promise<CheckpointProgressRow[]>;
  listProjectProgress(customerId: string, projectIds: string[]): Promise<ProjectProgressRow[]>;
}

export interface ProgressFlags {
  is_opened: boolean;
  is_completed: boolean;
}

export interface CatalogResponseLesson {
  lesson_code: string;
  title: string;
  order_index: number;
  is_extra: boolean;
  progress: ProgressFlags;
}

export interface CatalogResponseCheckpoint {
  checkpoint_code: string;
  title: string;
  order_index: number;
  progress: ProgressFlags;
}

export interface CatalogResponseProject {
  project_code: string;
  title: string;
  project_type: string;
  order_index: number;
  progress: ProgressFlags;
}

export interface CatalogResponseModule {
  module_code: string;
  title: string;
  order_index: number;
  lessons: CatalogResponseLesson[];
  checkpoints: CatalogResponseCheckpoint[];
  projects: CatalogResponseProject[];
}

export interface CatalogResponseLevel {
  code: CatalogLevelCode;
  name: string;
  order_index: number;
  modules: CatalogResponseModule[];
}

export interface CatalogResponse {
  mentor: {
    slug: string;
    name: string;
  };
  level_filter: CatalogLevelCode | null;
  levels: CatalogResponseLevel[];
}

export class CatalogError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly error: string,
    message: string
  ) {
    super(message);
    this.name = 'CatalogError';
  }
}

function normalizeLevelToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function normalizeCatalogLevel(level: string | string[] | undefined): CatalogLevelCode | null {
  const rawValue = Array.isArray(level) ? level[0] : level;
  if (!rawValue) return null;

  const normalized = normalizeLevelToken(rawValue);
  if (!normalized) return null;

  return LEVEL_CODE_ALIASES[normalized] ?? null;
}

export async function getMentorCatalog(
  params: { mentorSlug: string; email?: string | string[] | undefined; level?: string | string[] | undefined },
  deps: CatalogServiceDeps
): Promise<CatalogResponse> {
  const mentorSlug = params.mentorSlug?.trim();
  if (!mentorSlug) {
    throw new CatalogError(404, 'mentor_not_found', 'Active mentor not found');
  }

  const emailValue = Array.isArray(params.email) ? params.email[0] : params.email;
  const email = normalizeEmail(emailValue);
  if (!email) {
    throw new CatalogError(400, 'missing_email', 'Missing required query parameter: email');
  }

  const normalizedLevel = normalizeCatalogLevel(params.level);
  const levelWasProvided = Array.isArray(params.level) ? params.level.length > 0 : params.level !== undefined;
  if (levelWasProvided && !normalizedLevel) {
    throw new CatalogError(400, 'invalid_level', 'Invalid level filter');
  }

  const mentor = await deps.findActiveMentorBySlug(mentorSlug);
  if (!mentor) {
    throw new CatalogError(404, 'mentor_not_found', 'Active mentor not found');
  }

  const customer = await deps.findCustomerByEmail(email);
  if (!customer) {
    throw new CatalogError(404, 'customer_not_found', 'Customer not found');
  }

  const levels = await deps.listActiveLevelsByMentorId(mentor.id);
  const selectedLevels = (normalizedLevel ? levels.filter((level) => level.code === normalizedLevel) : levels).sort((a, b) => a.order_index - b.order_index);

  if (normalizedLevel && selectedLevels.length === 0) {
    throw new CatalogError(400, 'invalid_level', 'Level is not available for this mentor');
  }

  if (selectedLevels.length === 0) {
    throw new CatalogError(404, 'catalog_not_found', 'No published catalog found for this mentor');
  }

  const selectedLevelIds = selectedLevels.map((level) => level.id);
  const modules = (await deps.listActiveModulesByMentorId(mentor.id, selectedLevelIds)).sort((a, b) => a.order_index - b.order_index);
  if (modules.length === 0) {
    throw new CatalogError(404, 'catalog_not_found', 'No published catalog found for this mentor');
  }

  const moduleIds = modules.map((module) => module.id);
  const [lessons, checkpoints, projects] = (await Promise.all([
    deps.listPublishedLessonsByMentorId(mentor.id, selectedLevelIds, moduleIds),
    deps.listPublishedCheckpointsByMentorId(mentor.id, selectedLevelIds, moduleIds),
    deps.listPublishedProjectsByMentorId(mentor.id, selectedLevelIds, moduleIds)
  ])).map((items) => [...items].sort((a, b) => a.order_index - b.order_index)) as [
    CatalogLessonRow[],
    CatalogCheckpointRow[],
    CatalogProjectRow[]
  ];

  validateCatalogIntegrity(selectedLevels, modules, lessons, checkpoints, projects);

  if (lessons.length === 0 && checkpoints.length === 0 && projects.length === 0) {
    throw new CatalogError(404, 'catalog_not_found', 'No published catalog found for this mentor');
  }

  const [lessonProgressRows, checkpointProgressRows, projectProgressRows] = await Promise.all([
    deps.listLessonProgress(customer.id, lessons.map((lesson) => lesson.id)),
    deps.listCheckpointProgress(customer.id, checkpoints.map((checkpoint) => checkpoint.id)),
    deps.listProjectProgress(customer.id, projects.map((project) => project.id))
  ]);

  const lessonProgressMap = new Map(lessonProgressRows.map((row) => [row.lesson_id, toProgressFlags(row)]));
  const checkpointProgressMap = new Map(checkpointProgressRows.map((row) => [row.checkpoint_id, toProgressFlags(row)]));
  const projectProgressMap = new Map(projectProgressRows.map((row) => [row.project_id, toProgressFlags(row)]));

  const lessonsByModuleId = new Map<string, CatalogResponseLesson[]>();
  for (const lesson of lessons) {
    const moduleLessons = lessonsByModuleId.get(lesson.module_id) ?? [];
    moduleLessons.push({
      lesson_code: lesson.lesson_code,
      title: lesson.title,
      order_index: lesson.order_index,
      is_extra: lesson.is_extra,
      progress: lessonProgressMap.get(lesson.id) ?? defaultProgress()
    });
    lessonsByModuleId.set(lesson.module_id, moduleLessons);
  }

  const checkpointsByModuleId = new Map<string, CatalogResponseCheckpoint[]>();
  for (const checkpoint of checkpoints) {
    const moduleCheckpoints = checkpointsByModuleId.get(checkpoint.module_id) ?? [];
    moduleCheckpoints.push({
      checkpoint_code: checkpoint.checkpoint_code,
      title: checkpoint.title,
      order_index: checkpoint.order_index,
      progress: checkpointProgressMap.get(checkpoint.id) ?? defaultProgress()
    });
    checkpointsByModuleId.set(checkpoint.module_id, moduleCheckpoints);
  }

  const projectsByModuleId = new Map<string, CatalogResponseProject[]>();
  for (const project of projects) {
    const moduleProjects = projectsByModuleId.get(project.module_id) ?? [];
    moduleProjects.push({
      project_code: project.project_code,
      title: project.title,
      project_type: project.project_type,
      order_index: project.order_index,
      progress: projectProgressMap.get(project.id) ?? defaultProgress()
    });
    projectsByModuleId.set(project.module_id, moduleProjects);
  }

  const modulesByLevelId = new Map<string, CatalogResponseModule[]>();
  for (const module of modules) {
    const moduleLessons = lessonsByModuleId.get(module.id) ?? [];
    const moduleCheckpoints = checkpointsByModuleId.get(module.id) ?? [];
    const moduleProjects = projectsByModuleId.get(module.id) ?? [];

    if (moduleLessons.length === 0 && moduleCheckpoints.length === 0 && moduleProjects.length === 0) {
      continue;
    }

    const levelModules = modulesByLevelId.get(module.level_id) ?? [];
    levelModules.push({
      module_code: module.module_code,
      title: module.title,
      order_index: module.order_index,
      lessons: moduleLessons,
      checkpoints: moduleCheckpoints,
      projects: moduleProjects
    });
    modulesByLevelId.set(module.level_id, levelModules);
  }

  const responseLevels = selectedLevels
    .map<CatalogResponseLevel | null>((level) => {
      const levelModules = modulesByLevelId.get(level.id);
      if (!levelModules || levelModules.length === 0) {
        return null;
      }

      return {
        code: level.code,
        name: level.name,
        order_index: level.order_index,
        modules: levelModules
      };
    })
    .filter((level): level is CatalogResponseLevel => level !== null);

  if (responseLevels.length === 0) {
    throw new CatalogError(404, 'catalog_not_found', 'No published catalog found for this mentor');
  }

  return {
    mentor: {
      slug: mentor.slug,
      name: mentor.name
    },
    level_filter: normalizedLevel,
    levels: responseLevels
  };
}

function defaultProgress(): ProgressFlags {
  return {
    is_opened: false,
    is_completed: false
  };
}

function toProgressFlags(progress: { is_opened: boolean; is_completed: boolean }): ProgressFlags {
  return {
    is_opened: Boolean(progress.is_opened),
    is_completed: Boolean(progress.is_completed)
  };
}

function validateCatalogIntegrity(
  levels: CatalogLevelRow[],
  modules: CatalogModuleRow[],
  lessons: CatalogLessonRow[],
  checkpoints: CatalogCheckpointRow[],
  projects: CatalogProjectRow[]
) {
  const levelIds = new Set(levels.map((level) => level.id));
  const moduleIds = new Set(modules.map((module) => module.id));

  for (const module of modules) {
    if (!levelIds.has(module.level_id)) {
      throw new CatalogError(500, 'catalog_integrity_error', 'Catalog contains modules linked to an invalid level');
    }
  }

  for (const lesson of lessons) {
    if (!levelIds.has(lesson.level_id) || !moduleIds.has(lesson.module_id)) {
      throw new CatalogError(500, 'catalog_integrity_error', 'Catalog contains lessons linked to an invalid parent');
    }
  }

  for (const checkpoint of checkpoints) {
    if (!levelIds.has(checkpoint.level_id) || !moduleIds.has(checkpoint.module_id)) {
      throw new CatalogError(500, 'catalog_integrity_error', 'Catalog contains checkpoints linked to an invalid parent');
    }
  }

  for (const project of projects) {
    if (!levelIds.has(project.level_id) || !moduleIds.has(project.module_id)) {
      throw new CatalogError(500, 'catalog_integrity_error', 'Catalog contains projects linked to an invalid parent');
    }
  }
}

