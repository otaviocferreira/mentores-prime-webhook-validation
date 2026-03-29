import { normalizeEmail } from './webhook.service';

export type ProgressItemType = 'lesson' | 'checkpoint' | 'project';
export type ProgressEventType = 'opened' | 'completed';
export type LessonProgressStatus = 'NOT_STARTED' | 'OPENED' | 'IN_PROGRESS' | 'COMPLETED';
export type CheckpointProgressStatus = 'NOT_STARTED' | 'OPENED' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';
export type ProjectProgressStatus = 'NOT_STARTED' | 'OPENED' | 'IN_PROGRESS' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';

export interface ProgressMentorRow {
  id: string;
  slug: string;
  name: string;
  active: boolean;
}

export interface ProgressCustomerRow {
  id: string;
}

export interface ProgressItemRow {
  id: string;
  mentor_id: string;
}

export interface ProgressResponseState {
  is_opened: boolean;
  is_completed: boolean;
  first_opened_at: string | null;
  completed_at: string | null;
}

export interface LessonProgressRow {
  status: LessonProgressStatus;
  first_opened_at: string | null;
  last_opened_at: string | null;
  completed_at: string | null;
}

export interface CheckpointProgressRow {
  status: CheckpointProgressStatus;
  first_opened_at: string | null;
  last_opened_at: string | null;
  submitted_at: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  evaluator_note: string | null;
}

export interface ProjectProgressRow {
  status: ProjectProgressStatus;
  first_opened_at: string | null;
  last_opened_at: string | null;
  submitted_at: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  delivery_url: string | null;
  evaluator_note: string | null;
}

export interface LessonProgressInsertInput extends LessonProgressRow {
  customer_id: string;
}

export interface CheckpointProgressInsertInput extends CheckpointProgressRow {
  customer_id: string;
}

export interface ProjectProgressInsertInput extends ProjectProgressRow {
  customer_id: string;
}

export interface ProgressServiceDeps {
  findActiveMentorBySlug(mentorSlug: string): Promise<ProgressMentorRow | null>;
  findCustomerByEmail(email: string): Promise<ProgressCustomerRow | null>;
  findLessonByCode(itemCode: string): Promise<ProgressItemRow | null>;
  findCheckpointByCode(itemCode: string): Promise<ProgressItemRow | null>;
  findProjectByCode(itemCode: string): Promise<ProgressItemRow | null>;
  findLessonProgress(customerId: string, lessonId: string): Promise<LessonProgressRow | null>;
  findCheckpointProgress(customerId: string, checkpointId: string): Promise<CheckpointProgressRow | null>;
  findProjectProgress(customerId: string, projectId: string): Promise<ProjectProgressRow | null>;
  insertLessonProgress(lessonId: string, input: LessonProgressInsertInput): Promise<LessonProgressRow>;
  updateLessonProgress(lessonId: string, customerId: string, input: LessonProgressRow): Promise<LessonProgressRow>;
  insertCheckpointProgress(checkpointId: string, input: CheckpointProgressInsertInput): Promise<CheckpointProgressRow>;
  updateCheckpointProgress(
    checkpointId: string,
    customerId: string,
    input: CheckpointProgressRow
  ): Promise<CheckpointProgressRow>;
  insertProjectProgress(projectId: string, input: ProjectProgressInsertInput): Promise<ProjectProgressRow>;
  updateProjectProgress(projectId: string, customerId: string, input: ProjectProgressRow): Promise<ProjectProgressRow>;
}

export interface RecordMentorProgressParams {
  mentorSlug: string;
  email?: unknown;
  item_type?: unknown;
  item_code?: unknown;
  event?: unknown;
}

export interface RecordMentorProgressResponse {
  mentor_slug: string;
  email: string;
  item_type: ProgressItemType;
  item_code: string;
  event: ProgressEventType;
  progress: ProgressResponseState;
}

export class ProgressError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly error: string,
    message: string
  ) {
    super(message);
    this.name = 'ProgressError';
  }
}

export async function recordMentorProgress(
  params: RecordMentorProgressParams,
  deps: ProgressServiceDeps,
  now: Date = new Date()
): Promise<RecordMentorProgressResponse> {
  const mentorSlug = typeof params.mentorSlug === 'string' ? params.mentorSlug.trim() : '';
  if (!mentorSlug) {
    throw new ProgressError(404, 'mentor_not_found', 'Active mentor not found');
  }

  const email = normalizeEmail(typeof params.email === 'string' ? params.email : undefined);
  const itemType = normalizeItemType(params.item_type);
  const itemCode = typeof params.item_code === 'string' ? params.item_code.trim() : '';
  const event = normalizeEventType(params.event);

  if (!email || !itemCode) {
    throw new ProgressError(400, 'invalid_body', 'Invalid request body');
  }

  if (!itemType) {
    throw new ProgressError(400, 'invalid_item_type', 'Invalid item_type');
  }

  if (!event) {
    throw new ProgressError(400, 'invalid_event', 'Invalid event');
  }

  const mentor = await deps.findActiveMentorBySlug(mentorSlug);
  if (!mentor) {
    throw new ProgressError(404, 'mentor_not_found', 'Active mentor not found');
  }

  const customer = await deps.findCustomerByEmail(email);
  if (!customer) {
    throw new ProgressError(404, 'customer_not_found', 'Customer not found');
  }

  const item = await findItemByType(itemType, itemCode, deps);
  if (!item) {
    throw new ProgressError(404, 'item_not_found', 'Item not found');
  }

  if (item.mentor_id !== mentor.id) {
    throw new ProgressError(400, 'item_mentor_mismatch', 'Item does not belong to the informed mentor');
  }

  const savedProgress = await saveProgressByType(itemType, customer.id, item.id, event, deps, now);

  return {
    mentor_slug: mentor.slug,
    email,
    item_type: itemType,
    item_code: itemCode,
    event,
    progress: savedProgress
  };
}

function normalizeItemType(value: unknown): ProgressItemType | null {
  if (value === 'lesson' || value === 'checkpoint' || value === 'project') {
    return value;
  }

  return null;
}

function normalizeEventType(value: unknown): ProgressEventType | null {
  if (value === 'opened' || value === 'completed') {
    return value;
  }

  return null;
}

async function findItemByType(itemType: ProgressItemType, itemCode: string, deps: ProgressServiceDeps) {
  if (itemType === 'lesson') {
    return deps.findLessonByCode(itemCode);
  }

  if (itemType === 'checkpoint') {
    return deps.findCheckpointByCode(itemCode);
  }

  return deps.findProjectByCode(itemCode);
}

async function saveProgressByType(
  itemType: ProgressItemType,
  customerId: string,
  itemId: string,
  event: ProgressEventType,
  deps: ProgressServiceDeps,
  now: Date
): Promise<ProgressResponseState> {
  if (itemType === 'lesson') {
    const current = await deps.findLessonProgress(customerId, itemId);
    const next = buildLessonProgress(event, current, now);
    const saved = current
      ? await deps.updateLessonProgress(itemId, customerId, next)
      : await deps.insertLessonProgress(itemId, { customer_id: customerId, ...next });
    return toLessonResponse(saved);
  }

  if (itemType === 'checkpoint') {
    const current = await deps.findCheckpointProgress(customerId, itemId);
    const next = buildCheckpointProgress(event, current, now);
    const saved = current
      ? await deps.updateCheckpointProgress(itemId, customerId, next)
      : await deps.insertCheckpointProgress(itemId, { customer_id: customerId, ...next });
    return toCheckpointResponse(saved);
  }

  const current = await deps.findProjectProgress(customerId, itemId);
  const next = buildProjectProgress(event, current, now);
  const saved = current
    ? await deps.updateProjectProgress(itemId, customerId, next)
    : await deps.insertProjectProgress(itemId, { customer_id: customerId, ...next });
  return toProjectResponse(saved);
}

function buildLessonProgress(
  event: ProgressEventType,
  current: LessonProgressRow | null,
  now: Date
): LessonProgressRow {
  const nowIso = now.toISOString();
  const firstOpenedAt = current?.first_opened_at ?? nowIso;

  if (event === 'opened') {
    return {
      status: current?.status === 'COMPLETED' ? 'COMPLETED' : 'OPENED',
      first_opened_at: firstOpenedAt,
      last_opened_at: nowIso,
      completed_at: current?.completed_at ?? null
    };
  }

  return {
    status: 'COMPLETED',
    first_opened_at: firstOpenedAt,
    last_opened_at: nowIso,
    completed_at: current?.completed_at ?? nowIso
  };
}

function buildCheckpointProgress(
  event: ProgressEventType,
  current: CheckpointProgressRow | null,
  now: Date
): CheckpointProgressRow {
  const nowIso = now.toISOString();
  const firstOpenedAt = current?.first_opened_at ?? nowIso;

  if (event === 'opened') {
    return {
      status: current?.status === 'APPROVED' ? 'APPROVED' : 'OPENED',
      first_opened_at: firstOpenedAt,
      last_opened_at: nowIso,
      submitted_at: current?.submitted_at ?? null,
      approved_at: current?.approved_at ?? null,
      rejected_at: current?.rejected_at ?? null,
      evaluator_note: current?.evaluator_note ?? null
    };
  }

  return {
    status: 'APPROVED',
    first_opened_at: firstOpenedAt,
    last_opened_at: nowIso,
    submitted_at: current?.submitted_at ?? null,
    approved_at: current?.approved_at ?? nowIso,
    rejected_at: current?.rejected_at ?? null,
    evaluator_note: current?.evaluator_note ?? null
  };
}

function buildProjectProgress(
  event: ProgressEventType,
  current: ProjectProgressRow | null,
  now: Date
): ProjectProgressRow {
  const nowIso = now.toISOString();
  const firstOpenedAt = current?.first_opened_at ?? nowIso;

  if (event === 'opened') {
    return {
      status: current?.status === 'APPROVED' ? 'APPROVED' : 'OPENED',
      first_opened_at: firstOpenedAt,
      last_opened_at: nowIso,
      submitted_at: current?.submitted_at ?? null,
      approved_at: current?.approved_at ?? null,
      rejected_at: current?.rejected_at ?? null,
      delivery_url: current?.delivery_url ?? null,
      evaluator_note: current?.evaluator_note ?? null
    };
  }

  return {
    status: 'APPROVED',
    first_opened_at: firstOpenedAt,
    last_opened_at: nowIso,
    submitted_at: current?.submitted_at ?? null,
    approved_at: current?.approved_at ?? nowIso,
    rejected_at: current?.rejected_at ?? null,
    delivery_url: current?.delivery_url ?? null,
    evaluator_note: current?.evaluator_note ?? null
  };
}

function toLessonResponse(progress: LessonProgressRow): ProgressResponseState {
  return {
    is_opened: progress.status !== 'NOT_STARTED',
    is_completed: progress.status === 'COMPLETED',
    first_opened_at: progress.first_opened_at,
    completed_at: progress.completed_at
  };
}

function toCheckpointResponse(progress: CheckpointProgressRow): ProgressResponseState {
  return {
    is_opened: progress.status !== 'NOT_STARTED',
    is_completed: progress.status === 'APPROVED',
    first_opened_at: progress.first_opened_at,
    completed_at: progress.approved_at
  };
}

function toProjectResponse(progress: ProjectProgressRow): ProgressResponseState {
  return {
    is_opened: progress.status !== 'NOT_STARTED',
    is_completed: progress.status === 'APPROVED',
    first_opened_at: progress.first_opened_at,
    completed_at: progress.approved_at
  };
}
