import { normalizeEmail } from './webhook.service';

export type ProgressItemType = 'lesson' | 'checkpoint' | 'project';
export type ProgressEventType = 'opened' | 'completed';

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

export interface ProgressRow {
  is_opened: boolean;
  is_completed: boolean;
  first_opened_at: string | null;
  completed_at: string | null;
}

export interface ProgressUpsertInput extends ProgressRow {
  customer_id: string;
}

export interface ProgressServiceDeps {
  findActiveMentorBySlug(mentorSlug: string): Promise<ProgressMentorRow | null>;
  findCustomerByEmail(email: string): Promise<ProgressCustomerRow | null>;
  findLessonByCode(itemCode: string): Promise<ProgressItemRow | null>;
  findCheckpointByCode(itemCode: string): Promise<ProgressItemRow | null>;
  findProjectByCode(itemCode: string): Promise<ProgressItemRow | null>;
  findLessonProgress(customerId: string, lessonId: string): Promise<ProgressRow | null>;
  findCheckpointProgress(customerId: string, checkpointId: string): Promise<ProgressRow | null>;
  findProjectProgress(customerId: string, projectId: string): Promise<ProgressRow | null>;
  upsertLessonProgress(lessonId: string, input: ProgressUpsertInput): Promise<ProgressRow>;
  upsertCheckpointProgress(checkpointId: string, input: ProgressUpsertInput): Promise<ProgressRow>;
  upsertProjectProgress(projectId: string, input: ProgressUpsertInput): Promise<ProgressRow>;
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
  progress: ProgressRow;
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

  const currentProgress = await findCurrentProgress(itemType, customer.id, item.id, deps);
  const nextProgress = buildNextProgress(event, currentProgress, now);
  const savedProgress = await upsertProgress(itemType, item.id, customer.id, nextProgress, deps);

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

async function findCurrentProgress(
  itemType: ProgressItemType,
  customerId: string,
  itemId: string,
  deps: ProgressServiceDeps
): Promise<ProgressRow | null> {
  if (itemType === 'lesson') {
    return deps.findLessonProgress(customerId, itemId);
  }

  if (itemType === 'checkpoint') {
    return deps.findCheckpointProgress(customerId, itemId);
  }

  return deps.findProjectProgress(customerId, itemId);
}

function buildNextProgress(event: ProgressEventType, currentProgress: ProgressRow | null, now: Date): ProgressRow {
  const nowIso = now.toISOString();
  const firstOpenedAt = currentProgress?.first_opened_at ?? nowIso;

  if (event === 'opened') {
    return {
      is_opened: true,
      is_completed: currentProgress?.is_completed ?? false,
      first_opened_at: firstOpenedAt,
      completed_at: currentProgress?.completed_at ?? null
    };
  }

  return {
    is_opened: true,
    is_completed: true,
    first_opened_at: firstOpenedAt,
    completed_at: currentProgress?.completed_at ?? nowIso
  };
}

async function upsertProgress(
  itemType: ProgressItemType,
  itemId: string,
  customerId: string,
  progress: ProgressRow,
  deps: ProgressServiceDeps
): Promise<ProgressRow> {
  const input: ProgressUpsertInput = {
    customer_id: customerId,
    ...progress
  };

  if (itemType === 'lesson') {
    return deps.upsertLessonProgress(itemId, input);
  }

  if (itemType === 'checkpoint') {
    return deps.upsertCheckpointProgress(itemId, input);
  }

  return deps.upsertProjectProgress(itemId, input);
}
