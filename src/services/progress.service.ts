import { normalizeEmail } from './webhook.service';
import { DiagnosticLogger } from '../utils/request-log';

export type ProgressItemType = 'lesson' | 'checkpoint' | 'project';
export type ProgressEventType = 'opened' | 'completed' | 'submitted' | 'approved' | 'rejected' | 'in_progress';
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
  mentor_id: string;
}

export interface CheckpointProgressInsertInput extends CheckpointProgressRow {
  customer_id: string;
  mentor_id: string;
}

export interface ProjectProgressInsertInput extends ProjectProgressRow {
  customer_id: string;
  mentor_id: string;
}

export interface LessonProgressUpdateInput extends LessonProgressRow {
  mentor_id: string;
}

export interface CheckpointProgressUpdateInput extends CheckpointProgressRow {
  mentor_id: string;
}

export interface ProjectProgressUpdateInput extends ProjectProgressRow {
  mentor_id: string;
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
  updateLessonProgress(lessonId: string, customerId: string, input: LessonProgressUpdateInput): Promise<LessonProgressRow>;
  insertCheckpointProgress(checkpointId: string, input: CheckpointProgressInsertInput): Promise<CheckpointProgressRow>;
  updateCheckpointProgress(
    checkpointId: string,
    customerId: string,
    input: CheckpointProgressUpdateInput
  ): Promise<CheckpointProgressRow>;
  insertProjectProgress(projectId: string, input: ProjectProgressInsertInput): Promise<ProjectProgressRow>;
  updateProjectProgress(projectId: string, customerId: string, input: ProjectProgressUpdateInput): Promise<ProjectProgressRow>;
}

export interface RecordMentorProgressParams {
  mentorSlug: string;
  email?: unknown;
  item_type?: unknown;
  item_code?: unknown;
  event?: unknown;
  evaluator_note?: unknown;
  delivery_url?: unknown;
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
  now: Date = new Date(),
  logger?: DiagnosticLogger
): Promise<RecordMentorProgressResponse> {
  const mentorSlug = typeof params.mentorSlug === 'string' ? params.mentorSlug.trim() : '';
  if (!mentorSlug) {
    throw new ProgressError(404, 'mentor_not_found', 'Active mentor not found');
  }

  const email = normalizeEmail(typeof params.email === 'string' ? params.email : undefined);
  const itemType = normalizeItemType(params.item_type);
  const itemCode = typeof params.item_code === 'string' ? params.item_code.trim() : '';
  const event = normalizeEventType(params.event);
  const evaluatorNote = typeof params.evaluator_note === 'string' ? params.evaluator_note.trim() : '';
  const deliveryUrl = typeof params.delivery_url === 'string' ? params.delivery_url.trim() : '';

  if (!email || !itemCode) {
    throw new ProgressError(400, 'invalid_body', 'Invalid request body');
  }

  if (!itemType) {
    throw new ProgressError(400, 'invalid_item_type', 'Invalid item_type');
  }

  if (!event) {
    throw new ProgressError(400, 'invalid_event', 'Invalid event');
  }

  validateEventForItemType(itemType, event);

  if ((event === 'approved' || event === 'rejected') && (itemType === 'checkpoint' || itemType === 'project') && !evaluatorNote) {
    throw new ProgressError(400, 'missing_evaluator_note', 'evaluator_note is required for approved or rejected events');
  }

  logger?.info('mentor_lookup', 'resolving mentor', { mentor_slug: mentorSlug });
  const mentor = await deps.findActiveMentorBySlug(mentorSlug);
  if (!mentor) {
    throw new ProgressError(404, 'mentor_not_found', 'Active mentor not found');
  }

  const customer = await deps.findCustomerByEmail(email);
  logger?.info('customer_lookup', customer ? 'customer resolved' : 'customer not found');
  if (!customer) {
    throw new ProgressError(404, 'customer_not_found', 'Customer not found');
  }

  logger?.info('item_lookup', 'resolving item by type', { item_type: itemType, item_code: itemCode });
  const item = await findItemByType(itemType, itemCode, deps);
  if (!item) {
    throw new ProgressError(404, 'item_not_found', 'Item not found');
  }

  if (item.mentor_id !== mentor.id) {
    throw new ProgressError(400, 'item_mentor_mismatch', 'Item does not belong to the informed mentor');
  }

  const savedProgress = await saveProgressByType(
    itemType,
    customer.id,
    item.id,
    item.mentor_id,
    event,
    {
      evaluator_note: evaluatorNote || null,
      delivery_url: deliveryUrl || null
    },
    deps,
    now,
    logger
  );

  logger?.info('progress_result', 'progress saved', {
    status: 200,
    item_type: itemType,
    item_code: itemCode,
    event,
    is_opened: savedProgress.is_opened,
    is_completed: savedProgress.is_completed
  });

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
  if (
    value === 'opened' ||
    value === 'completed' ||
    value === 'submitted' ||
    value === 'approved' ||
    value === 'rejected' ||
    value === 'in_progress'
  ) {
    return value;
  }

  return null;
}

function validateEventForItemType(itemType: ProgressItemType, event: ProgressEventType) {
  if (itemType === 'lesson') {
    if (event !== 'opened' && event !== 'completed') {
      throw new ProgressError(400, 'invalid_event', 'Lessons accept only opened or completed events');
    }
    return;
  }

  if (itemType === 'checkpoint') {
    if (event !== 'opened' && event !== 'submitted' && event !== 'approved' && event !== 'rejected') {
      throw new ProgressError(400, 'invalid_event', 'Checkpoints accept only opened, submitted, approved or rejected events');
    }
    return;
  }

  if (event !== 'opened' && event !== 'in_progress' && event !== 'submitted' && event !== 'approved' && event !== 'rejected') {
    throw new ProgressError(400, 'invalid_event', 'Projects accept only opened, in_progress, submitted, approved or rejected events');
  }
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
  mentorId: string,
  event: ProgressEventType,
  metadata: { evaluator_note: string | null; delivery_url: string | null },
  deps: ProgressServiceDeps,
  now: Date,
  logger?: DiagnosticLogger
): Promise<ProgressResponseState> {
  if (itemType === 'lesson') {
    const current = await deps.findLessonProgress(customerId, itemId);
    const next = buildLessonProgress(event, current, now);
    const action = current ? 'update' : 'insert';
    logger?.info('progress_transition', 'lesson progress transition', {
      item_type: itemType,
      previous_status: current?.status ?? null,
      next_status: next.status,
      action
    });
    const saved = current
      ? await deps.updateLessonProgress(itemId, customerId, { mentor_id: mentorId, ...next })
      : await insertOrUpdateLessonProgress(itemId, customerId, mentorId, next, deps, now, event);
    return toLessonResponse(saved);
  }

  if (itemType === 'checkpoint') {
    const current = await deps.findCheckpointProgress(customerId, itemId);
    const next = buildCheckpointProgress(event, current, now, metadata.evaluator_note);
    const action = current ? 'update' : 'insert';
    logger?.info('progress_transition', 'checkpoint progress transition', {
      item_type: itemType,
      previous_status: current?.status ?? null,
      next_status: next.status,
      action
    });
    const saved = current
      ? await deps.updateCheckpointProgress(itemId, customerId, { mentor_id: mentorId, ...next })
      : await insertOrUpdateCheckpointProgress(itemId, customerId, mentorId, event, metadata.evaluator_note, next, deps, now);
    return toCheckpointResponse(saved);
  }

  const current = await deps.findProjectProgress(customerId, itemId);
  const next = buildProjectProgress(event, current, now, metadata.evaluator_note, metadata.delivery_url);
  const action = current ? 'update' : 'insert';
  logger?.info('progress_transition', 'project progress transition', {
    item_type: itemType,
    previous_status: current?.status ?? null,
    next_status: next.status,
    action
  });
  const saved = current
    ? await deps.updateProjectProgress(itemId, customerId, { mentor_id: mentorId, ...next })
    : await insertOrUpdateProjectProgress(itemId, customerId, mentorId, event, metadata.evaluator_note, metadata.delivery_url, next, deps, now);
  return toProjectResponse(saved);
}

async function insertOrUpdateLessonProgress(
  itemId: string,
  customerId: string,
  mentorId: string,
  next: LessonProgressRow,
  deps: ProgressServiceDeps,
  now: Date,
  event: ProgressEventType
): Promise<LessonProgressRow> {
  try {
    return await deps.insertLessonProgress(itemId, { customer_id: customerId, mentor_id: mentorId, ...next });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const current = await deps.findLessonProgress(customerId, itemId);
    const retry = buildLessonProgress(event, current, now);
    return deps.updateLessonProgress(itemId, customerId, { mentor_id: mentorId, ...retry });
  }
}

async function insertOrUpdateCheckpointProgress(
  itemId: string,
  customerId: string,
  mentorId: string,
  event: ProgressEventType,
  evaluatorNote: string | null,
  next: CheckpointProgressRow,
  deps: ProgressServiceDeps,
  now: Date
): Promise<CheckpointProgressRow> {
  try {
    return await deps.insertCheckpointProgress(itemId, { customer_id: customerId, mentor_id: mentorId, ...next });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const current = await deps.findCheckpointProgress(customerId, itemId);
    const retry = buildCheckpointProgress(event, current, now, evaluatorNote);
    return deps.updateCheckpointProgress(itemId, customerId, { mentor_id: mentorId, ...retry });
  }
}

async function insertOrUpdateProjectProgress(
  itemId: string,
  customerId: string,
  mentorId: string,
  event: ProgressEventType,
  evaluatorNote: string | null,
  deliveryUrl: string | null,
  next: ProjectProgressRow,
  deps: ProgressServiceDeps,
  now: Date
): Promise<ProjectProgressRow> {
  try {
    return await deps.insertProjectProgress(itemId, { customer_id: customerId, mentor_id: mentorId, ...next });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const current = await deps.findProjectProgress(customerId, itemId);
    const retry = buildProjectProgress(event, current, now, evaluatorNote, deliveryUrl);
    return deps.updateProjectProgress(itemId, customerId, { mentor_id: mentorId, ...retry });
  }
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
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
      status: current?.status === 'COMPLETED' ? 'COMPLETED' : current?.status === 'IN_PROGRESS' ? 'IN_PROGRESS' : 'OPENED',
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
  now: Date,
  evaluatorNote: string | null
): CheckpointProgressRow {
  const nowIso = now.toISOString();
  const firstOpenedAt = current?.first_opened_at ?? nowIso;

  if (event === 'opened') {
    return {
      status: current?.status === 'APPROVED' ? 'APPROVED' : current?.status === 'SUBMITTED' ? 'SUBMITTED' : current?.status === 'REJECTED' ? 'REJECTED' : 'OPENED',
      first_opened_at: firstOpenedAt,
      last_opened_at: nowIso,
      submitted_at: current?.submitted_at ?? null,
      approved_at: current?.approved_at ?? null,
      rejected_at: current?.rejected_at ?? null,
      evaluator_note: current?.evaluator_note ?? null
    };
  }

  if (event === 'submitted') {
    return {
      status: current?.status === 'APPROVED' ? 'APPROVED' : 'SUBMITTED',
      first_opened_at: firstOpenedAt,
      last_opened_at: current?.last_opened_at ?? nowIso,
      submitted_at: current?.status === 'APPROVED' ? current?.submitted_at ?? null : current?.submitted_at ?? nowIso,
      approved_at: current?.approved_at ?? null,
      rejected_at: current?.rejected_at ?? null,
      evaluator_note: current?.status === 'APPROVED' ? current?.evaluator_note ?? null : current?.evaluator_note ?? null
    };
  }

  if (event === 'approved') {
    return {
      status: 'APPROVED',
      first_opened_at: firstOpenedAt,
      last_opened_at: current?.last_opened_at ?? nowIso,
      submitted_at: current?.submitted_at ?? null,
      approved_at: current?.approved_at ?? nowIso,
      rejected_at: current?.rejected_at ?? null,
      evaluator_note: evaluatorNote
    };
  }

  return {
    status: 'REJECTED',
    first_opened_at: firstOpenedAt,
    last_opened_at: current?.last_opened_at ?? nowIso,
    submitted_at: current?.submitted_at ?? null,
    approved_at: current?.approved_at ?? null,
    rejected_at: current?.rejected_at ?? nowIso,
    evaluator_note: evaluatorNote
  };
}

function buildProjectProgress(
  event: ProgressEventType,
  current: ProjectProgressRow | null,
  now: Date,
  evaluatorNote: string | null,
  deliveryUrl: string | null
): ProjectProgressRow {
  const nowIso = now.toISOString();
  const firstOpenedAt = current?.first_opened_at ?? nowIso;

  if (event === 'opened') {
    return {
      status: current?.status === 'APPROVED'
        ? 'APPROVED'
        : current?.status === 'SUBMITTED'
          ? 'SUBMITTED'
          : current?.status === 'REJECTED'
            ? 'REJECTED'
            : current?.status === 'IN_PROGRESS'
              ? 'IN_PROGRESS'
              : 'OPENED',
      first_opened_at: firstOpenedAt,
      last_opened_at: nowIso,
      submitted_at: current?.submitted_at ?? null,
      approved_at: current?.approved_at ?? null,
      rejected_at: current?.rejected_at ?? null,
      delivery_url: current?.delivery_url ?? null,
      evaluator_note: current?.evaluator_note ?? null
    };
  }

  if (event === 'in_progress') {
    return {
      status: current?.status === 'APPROVED'
        ? 'APPROVED'
        : current?.status === 'SUBMITTED'
          ? 'SUBMITTED'
          : current?.status === 'REJECTED'
            ? 'REJECTED'
            : 'IN_PROGRESS',
      first_opened_at: firstOpenedAt,
      last_opened_at: nowIso,
      submitted_at: current?.submitted_at ?? null,
      approved_at: current?.approved_at ?? null,
      rejected_at: current?.rejected_at ?? null,
      delivery_url: current?.delivery_url ?? null,
      evaluator_note: current?.evaluator_note ?? null
    };
  }

  if (event === 'submitted') {
    return {
      status: current?.status === 'APPROVED' ? 'APPROVED' : 'SUBMITTED',
      first_opened_at: firstOpenedAt,
      last_opened_at: current?.last_opened_at ?? nowIso,
      submitted_at: current?.status === 'APPROVED' ? current?.submitted_at ?? null : current?.submitted_at ?? nowIso,
      approved_at: current?.approved_at ?? null,
      rejected_at: current?.rejected_at ?? null,
      delivery_url: deliveryUrl ?? current?.delivery_url ?? null,
      evaluator_note: current?.evaluator_note ?? null
    };
  }

  if (event === 'approved') {
    return {
      status: 'APPROVED',
      first_opened_at: firstOpenedAt,
      last_opened_at: current?.last_opened_at ?? nowIso,
      submitted_at: current?.submitted_at ?? null,
      approved_at: current?.approved_at ?? nowIso,
      rejected_at: current?.rejected_at ?? null,
      delivery_url: current?.delivery_url ?? null,
      evaluator_note: evaluatorNote
    };
  }

  return {
    status: 'REJECTED',
    first_opened_at: firstOpenedAt,
    last_opened_at: current?.last_opened_at ?? nowIso,
    submitted_at: current?.submitted_at ?? null,
    approved_at: current?.approved_at ?? null,
    rejected_at: current?.rejected_at ?? nowIso,
    delivery_url: current?.delivery_url ?? null,
    evaluator_note: evaluatorNote
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
