import test from 'node:test';
import assert from 'node:assert/strict';
import { ProgressError, recordMentorProgress } from '../services/progress.service';

type LessonRow = {
  mentor_id: string;
  status: 'NOT_STARTED' | 'OPENED' | 'IN_PROGRESS' | 'COMPLETED';
  first_opened_at: string | null;
  last_opened_at: string | null;
  completed_at: string | null;
};

type CheckpointRow = {
  mentor_id: string;
  status: 'NOT_STARTED' | 'OPENED' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';
  first_opened_at: string | null;
  last_opened_at: string | null;
  submitted_at: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  evaluator_note: string | null;
};

type ProjectRow = {
  mentor_id: string;
  status: 'NOT_STARTED' | 'OPENED' | 'IN_PROGRESS' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';
  first_opened_at: string | null;
  last_opened_at: string | null;
  submitted_at: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  delivery_url: string | null;
  evaluator_note: string | null;
};

function createProgressDeps() {
  const lessonStore: Record<string, LessonRow> = {};
  const checkpointStore: Record<string, CheckpointRow> = {};
  const projectStore: Record<string, ProjectRow> = {};

  const deps = {
    stores: { lessonStore, checkpointStore, projectStore },
    async findActiveMentorBySlug(mentorSlug: string) {
      return mentorSlug === 'python' ? { id: 'mentor-1', slug: 'python', name: 'Python Mentor', active: true } : null;
    },
    async findCustomerByEmail(email: string) {
      return email === 'aluno@example.com' ? { id: 'customer-1' } : null;
    },
    async findLessonByCode(itemCode: string) {
      if (itemCode === 'PY-INI-01-01') return { id: 'lesson-1', mentor_id: 'mentor-1' };
      if (itemCode === 'OUTRO-MENTOR') return { id: 'lesson-2', mentor_id: 'mentor-2' };
      return null;
    },
    async findCheckpointByCode(itemCode: string) {
      if (itemCode === 'CP-1') return { id: 'checkpoint-1', mentor_id: 'mentor-1' };
      return null;
    },
    async findProjectByCode(itemCode: string) {
      if (itemCode === 'PJ-1') return { id: 'project-1', mentor_id: 'mentor-1' };
      return null;
    },
    async findLessonProgress(customerId: string, lessonId: string) {
      return lessonStore[`${customerId}:${lessonId}`] ?? null;
    },
    async findCheckpointProgress(customerId: string, checkpointId: string) {
      return checkpointStore[`${customerId}:${checkpointId}`] ?? null;
    },
    async findProjectProgress(customerId: string, projectId: string) {
      return projectStore[`${customerId}:${projectId}`] ?? null;
    },
    async insertLessonProgress(lessonId: string, input: any) {
      const key = `${input.customer_id}:${lessonId}`;
      lessonStore[key] = { mentor_id: input.mentor_id, status: input.status, first_opened_at: input.first_opened_at, last_opened_at: input.last_opened_at, completed_at: input.completed_at };
      return lessonStore[key];
    },
    async updateLessonProgress(lessonId: string, customerId: string, input: any) {
      const key = `${customerId}:${lessonId}`;
      lessonStore[key] = { mentor_id: input.mentor_id, status: input.status, first_opened_at: input.first_opened_at, last_opened_at: input.last_opened_at, completed_at: input.completed_at };
      return lessonStore[key];
    },
    async insertCheckpointProgress(checkpointId: string, input: any) {
      const key = `${input.customer_id}:${checkpointId}`;
      checkpointStore[key] = { mentor_id: input.mentor_id, status: input.status, first_opened_at: input.first_opened_at, last_opened_at: input.last_opened_at, submitted_at: input.submitted_at, approved_at: input.approved_at, rejected_at: input.rejected_at, evaluator_note: input.evaluator_note };
      return checkpointStore[key];
    },
    async updateCheckpointProgress(checkpointId: string, customerId: string, input: any) {
      const key = `${customerId}:${checkpointId}`;
      checkpointStore[key] = { mentor_id: input.mentor_id, status: input.status, first_opened_at: input.first_opened_at, last_opened_at: input.last_opened_at, submitted_at: input.submitted_at, approved_at: input.approved_at, rejected_at: input.rejected_at, evaluator_note: input.evaluator_note };
      return checkpointStore[key];
    },
    async insertProjectProgress(projectId: string, input: any) {
      const key = `${input.customer_id}:${projectId}`;
      projectStore[key] = { mentor_id: input.mentor_id, status: input.status, first_opened_at: input.first_opened_at, last_opened_at: input.last_opened_at, submitted_at: input.submitted_at, approved_at: input.approved_at, rejected_at: input.rejected_at, delivery_url: input.delivery_url, evaluator_note: input.evaluator_note };
      return projectStore[key];
    },
    async updateProjectProgress(projectId: string, customerId: string, input: any) {
      const key = `${customerId}:${projectId}`;
      projectStore[key] = { mentor_id: input.mentor_id, status: input.status, first_opened_at: input.first_opened_at, last_opened_at: input.last_opened_at, submitted_at: input.submitted_at, approved_at: input.approved_at, rejected_at: input.rejected_at, delivery_url: input.delivery_url, evaluator_note: input.evaluator_note };
      return projectStore[key];
    }
  };

  return deps;
}

test('recordMentorProgress lesson opened cria status OPENED e persiste mentor_id', async () => {
  const deps = createProgressDeps();
  const response = await recordMentorProgress({ mentorSlug: 'python', email: '  ALUNO@example.com  ', item_type: 'lesson', item_code: 'PY-INI-01-01', event: 'opened' }, deps, new Date('2026-03-29T12:00:00.000Z'));
  assert.deepEqual(response.progress, { is_opened: true, is_completed: false, first_opened_at: '2026-03-29T12:00:00.000Z', completed_at: null });
  assert.equal(deps.stores.lessonStore['customer-1:lesson-1']?.status, 'OPENED');
  assert.equal(deps.stores.lessonStore['customer-1:lesson-1']?.mentor_id, 'mentor-1');
});

test('recordMentorProgress lesson completed cria status COMPLETED e persiste mentor_id', async () => {
  const deps = createProgressDeps();
  const response = await recordMentorProgress({ mentorSlug: 'python', email: 'aluno@example.com', item_type: 'lesson', item_code: 'PY-INI-01-01', event: 'completed' }, deps, new Date('2026-03-29T12:00:00.000Z'));
  assert.deepEqual(response.progress, { is_opened: true, is_completed: true, first_opened_at: '2026-03-29T12:00:00.000Z', completed_at: '2026-03-29T12:00:00.000Z' });
  assert.equal(deps.stores.lessonStore['customer-1:lesson-1']?.status, 'COMPLETED');
  assert.equal(deps.stores.lessonStore['customer-1:lesson-1']?.mentor_id, 'mentor-1');
});

test('recordMentorProgress checkpoint opened cria status OPENED e persiste mentor_id', async () => {
  const deps = createProgressDeps();
  const response = await recordMentorProgress({ mentorSlug: 'python', email: 'aluno@example.com', item_type: 'checkpoint', item_code: 'CP-1', event: 'opened' }, deps, new Date('2026-03-29T12:00:00.000Z'));
  assert.deepEqual(response.progress, { is_opened: true, is_completed: false, first_opened_at: '2026-03-29T12:00:00.000Z', completed_at: null });
  assert.equal(deps.stores.checkpointStore['customer-1:checkpoint-1']?.status, 'OPENED');
  assert.equal(deps.stores.checkpointStore['customer-1:checkpoint-1']?.mentor_id, 'mentor-1');
});

test('recordMentorProgress checkpoint completed cria status APPROVED, usa approved_at e persiste mentor_id', async () => {
  const deps = createProgressDeps();
  const response = await recordMentorProgress({ mentorSlug: 'python', email: 'aluno@example.com', item_type: 'checkpoint', item_code: 'CP-1', event: 'completed' }, deps, new Date('2026-03-29T12:00:00.000Z'));
  assert.deepEqual(response.progress, { is_opened: true, is_completed: true, first_opened_at: '2026-03-29T12:00:00.000Z', completed_at: '2026-03-29T12:00:00.000Z' });
  assert.equal(deps.stores.checkpointStore['customer-1:checkpoint-1']?.status, 'APPROVED');
  assert.equal(deps.stores.checkpointStore['customer-1:checkpoint-1']?.approved_at, '2026-03-29T12:00:00.000Z');
  assert.equal(deps.stores.checkpointStore['customer-1:checkpoint-1']?.mentor_id, 'mentor-1');
});

test('recordMentorProgress project opened cria status OPENED e persiste mentor_id', async () => {
  const deps = createProgressDeps();
  const response = await recordMentorProgress({ mentorSlug: 'python', email: 'aluno@example.com', item_type: 'project', item_code: 'PJ-1', event: 'opened' }, deps, new Date('2026-03-29T12:00:00.000Z'));
  assert.deepEqual(response.progress, { is_opened: true, is_completed: false, first_opened_at: '2026-03-29T12:00:00.000Z', completed_at: null });
  assert.equal(deps.stores.projectStore['customer-1:project-1']?.status, 'OPENED');
  assert.equal(deps.stores.projectStore['customer-1:project-1']?.mentor_id, 'mentor-1');
});

test('recordMentorProgress project completed cria status APPROVED, usa approved_at e persiste mentor_id', async () => {
  const deps = createProgressDeps();
  const response = await recordMentorProgress({ mentorSlug: 'python', email: 'aluno@example.com', item_type: 'project', item_code: 'PJ-1', event: 'completed' }, deps, new Date('2026-03-29T12:00:00.000Z'));
  assert.deepEqual(response.progress, { is_opened: true, is_completed: true, first_opened_at: '2026-03-29T12:00:00.000Z', completed_at: '2026-03-29T12:00:00.000Z' });
  assert.equal(deps.stores.projectStore['customer-1:project-1']?.status, 'APPROVED');
  assert.equal(deps.stores.projectStore['customer-1:project-1']?.approved_at, '2026-03-29T12:00:00.000Z');
  assert.equal(deps.stores.projectStore['customer-1:project-1']?.mentor_id, 'mentor-1');
});

test('recordMentorProgress completed preserva first_opened_at existente e nao duplica registro', async () => {
  const deps = createProgressDeps();
  await recordMentorProgress({ mentorSlug: 'python', email: 'aluno@example.com', item_type: 'lesson', item_code: 'PY-INI-01-01', event: 'opened' }, deps, new Date('2026-03-20T10:00:00.000Z'));
  const response = await recordMentorProgress({ mentorSlug: 'python', email: 'aluno@example.com', item_type: 'lesson', item_code: 'PY-INI-01-01', event: 'completed' }, deps, new Date('2026-03-29T12:00:00.000Z'));
  assert.deepEqual(response.progress, { is_opened: true, is_completed: true, first_opened_at: '2026-03-20T10:00:00.000Z', completed_at: '2026-03-29T12:00:00.000Z' });
  assert.equal(Object.keys(deps.stores.lessonStore).length, 1);
  assert.equal(deps.stores.lessonStore['customer-1:lesson-1']?.mentor_id, 'mentor-1');
});

test('recordMentorProgress chamadas repetidas preservam completed_at existente', async () => {
  const deps = createProgressDeps();
  await recordMentorProgress({ mentorSlug: 'python', email: 'aluno@example.com', item_type: 'project', item_code: 'PJ-1', event: 'completed' }, deps, new Date('2026-03-29T12:00:00.000Z'));
  const response = await recordMentorProgress({ mentorSlug: 'python', email: 'aluno@example.com', item_type: 'project', item_code: 'PJ-1', event: 'completed' }, deps, new Date('2026-03-30T12:00:00.000Z'));
  assert.deepEqual(response.progress, { is_opened: true, is_completed: true, first_opened_at: '2026-03-29T12:00:00.000Z', completed_at: '2026-03-29T12:00:00.000Z' });
  assert.equal(Object.keys(deps.stores.projectStore).length, 1);
  assert.equal(deps.stores.projectStore['customer-1:project-1']?.mentor_id, 'mentor-1');
});

test('recordMentorProgress retorna 400 para body invalido', async () => {
  await assert.rejects(() => recordMentorProgress({ mentorSlug: 'python', email: '', item_type: 'lesson', item_code: '', event: 'opened' }, createProgressDeps()), (error: unknown) => {
    assert.ok(error instanceof ProgressError);
    assert.equal(error.statusCode, 400);
    assert.equal(error.error, 'invalid_body');
    return true;
  });
});

test('recordMentorProgress retorna 400 para item_type invalido', async () => {
  await assert.rejects(() => recordMentorProgress({ mentorSlug: 'python', email: 'aluno@example.com', item_type: 'module', item_code: 'X', event: 'opened' }, createProgressDeps()), (error: unknown) => {
    assert.ok(error instanceof ProgressError);
    assert.equal(error.statusCode, 400);
    assert.equal(error.error, 'invalid_item_type');
    return true;
  });
});

test('recordMentorProgress retorna 400 para event invalido', async () => {
  await assert.rejects(() => recordMentorProgress({ mentorSlug: 'python', email: 'aluno@example.com', item_type: 'lesson', item_code: 'PY-INI-01-01', event: 'finish' }, createProgressDeps()), (error: unknown) => {
    assert.ok(error instanceof ProgressError);
    assert.equal(error.statusCode, 400);
    assert.equal(error.error, 'invalid_event');
    return true;
  });
});

test('recordMentorProgress retorna 404 para mentor inexistente', async () => {
  await assert.rejects(() => recordMentorProgress({ mentorSlug: 'java', email: 'aluno@example.com', item_type: 'lesson', item_code: 'PY-INI-01-01', event: 'opened' }, createProgressDeps()), (error: unknown) => {
    assert.ok(error instanceof ProgressError);
    assert.equal(error.statusCode, 404);
    assert.equal(error.error, 'mentor_not_found');
    return true;
  });
});

test('recordMentorProgress retorna 404 para customer inexistente', async () => {
  await assert.rejects(() => recordMentorProgress({ mentorSlug: 'python', email: 'outro@example.com', item_type: 'lesson', item_code: 'PY-INI-01-01', event: 'opened' }, createProgressDeps()), (error: unknown) => {
    assert.ok(error instanceof ProgressError);
    assert.equal(error.statusCode, 404);
    assert.equal(error.error, 'customer_not_found');
    return true;
  });
});

test('recordMentorProgress retorna 404 para item inexistente', async () => {
  await assert.rejects(() => recordMentorProgress({ mentorSlug: 'python', email: 'aluno@example.com', item_type: 'project', item_code: 'nao-existe', event: 'opened' }, createProgressDeps()), (error: unknown) => {
    assert.ok(error instanceof ProgressError);
    assert.equal(error.statusCode, 404);
    assert.equal(error.error, 'item_not_found');
    return true;
  });
});

test('recordMentorProgress retorna 400 se item nao pertence ao mentor informado', async () => {
  await assert.rejects(() => recordMentorProgress({ mentorSlug: 'python', email: 'aluno@example.com', item_type: 'lesson', item_code: 'OUTRO-MENTOR', event: 'opened' }, createProgressDeps()), (error: unknown) => {
    assert.ok(error instanceof ProgressError);
    assert.equal(error.statusCode, 400);
    assert.equal(error.error, 'item_mentor_mismatch');
    return true;
  });
});
