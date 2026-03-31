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

function createProgressDeps(options?: { projectInsertConflictOnce?: boolean }) {
  const lessonStore: Record<string, LessonRow> = {};
  const checkpointStore: Record<string, CheckpointRow> = {};
  const projectStore: Record<string, ProjectRow> = {};
  let shouldConflictProjectInsert = options?.projectInsertConflictOnce ?? false;

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
      if (shouldConflictProjectInsert) {
        shouldConflictProjectInsert = false;
        projectStore[key] = { mentor_id: input.mentor_id, status: 'OPENED', first_opened_at: input.first_opened_at, last_opened_at: input.last_opened_at, submitted_at: null, approved_at: null, rejected_at: null, delivery_url: null, evaluator_note: null };
        throw { code: '23505' };
      }
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
});

test('recordMentorProgress checkpoint opened cria status OPENED', async () => {
  const deps = createProgressDeps();
  const response = await recordMentorProgress({ mentorSlug: 'python', email: 'aluno@example.com', item_type: 'checkpoint', item_code: 'CP-1', event: 'opened' }, deps, new Date('2026-03-29T12:00:00.000Z'));
  assert.deepEqual(response.progress, { is_opened: true, is_completed: false, first_opened_at: '2026-03-29T12:00:00.000Z', completed_at: null });
  assert.equal(deps.stores.checkpointStore['customer-1:checkpoint-1']?.status, 'OPENED');
});

test('recordMentorProgress checkpoint submitted cria status SUBMITTED e submitted_at', async () => {
  const deps = createProgressDeps();
  await recordMentorProgress({ mentorSlug: 'python', email: 'aluno@example.com', item_type: 'checkpoint', item_code: 'CP-1', event: 'opened' }, deps, new Date('2026-03-29T11:00:00.000Z'));
  const response = await recordMentorProgress({ mentorSlug: 'python', email: 'aluno@example.com', item_type: 'checkpoint', item_code: 'CP-1', event: 'submitted' }, deps, new Date('2026-03-29T12:00:00.000Z'));
  assert.deepEqual(response.progress, { is_opened: true, is_completed: false, first_opened_at: '2026-03-29T11:00:00.000Z', completed_at: null });
  assert.equal(deps.stores.checkpointStore['customer-1:checkpoint-1']?.status, 'SUBMITTED');
  assert.equal(deps.stores.checkpointStore['customer-1:checkpoint-1']?.submitted_at, '2026-03-29T12:00:00.000Z');
});

test('recordMentorProgress checkpoint approved exige evaluator_note e usa approved_at', async () => {
  const deps = createProgressDeps();
  const response = await recordMentorProgress({ mentorSlug: 'python', email: 'aluno@example.com', item_type: 'checkpoint', item_code: 'CP-1', event: 'approved', evaluator_note: 'Boa entrega' }, deps, new Date('2026-03-29T12:00:00.000Z'));
  assert.deepEqual(response.progress, { is_opened: true, is_completed: true, first_opened_at: '2026-03-29T12:00:00.000Z', completed_at: '2026-03-29T12:00:00.000Z' });
  assert.equal(deps.stores.checkpointStore['customer-1:checkpoint-1']?.status, 'APPROVED');
  assert.equal(deps.stores.checkpointStore['customer-1:checkpoint-1']?.approved_at, '2026-03-29T12:00:00.000Z');
  assert.equal(deps.stores.checkpointStore['customer-1:checkpoint-1']?.evaluator_note, 'Boa entrega');
});

test('recordMentorProgress checkpoint rejected exige evaluator_note e usa rejected_at', async () => {
  const deps = createProgressDeps();
  const response = await recordMentorProgress({ mentorSlug: 'python', email: 'aluno@example.com', item_type: 'checkpoint', item_code: 'CP-1', event: 'rejected', evaluator_note: 'Ajuste a entrega' }, deps, new Date('2026-03-29T12:00:00.000Z'));
  assert.deepEqual(response.progress, { is_opened: true, is_completed: false, first_opened_at: '2026-03-29T12:00:00.000Z', completed_at: null });
  assert.equal(deps.stores.checkpointStore['customer-1:checkpoint-1']?.status, 'REJECTED');
  assert.equal(deps.stores.checkpointStore['customer-1:checkpoint-1']?.rejected_at, '2026-03-29T12:00:00.000Z');
  assert.equal(deps.stores.checkpointStore['customer-1:checkpoint-1']?.evaluator_note, 'Ajuste a entrega');
});

test('recordMentorProgress project opened cria status OPENED', async () => {
  const deps = createProgressDeps();
  const response = await recordMentorProgress({ mentorSlug: 'python', email: 'aluno@example.com', item_type: 'project', item_code: 'PJ-1', event: 'opened' }, deps, new Date('2026-03-29T12:00:00.000Z'));
  assert.deepEqual(response.progress, { is_opened: true, is_completed: false, first_opened_at: '2026-03-29T12:00:00.000Z', completed_at: null });
  assert.equal(deps.stores.projectStore['customer-1:project-1']?.status, 'OPENED');
});

test('recordMentorProgress project in_progress cria status IN_PROGRESS', async () => {
  const deps = createProgressDeps();
  const response = await recordMentorProgress({ mentorSlug: 'python', email: 'aluno@example.com', item_type: 'project', item_code: 'PJ-1', event: 'in_progress' }, deps, new Date('2026-03-29T12:00:00.000Z'));
  assert.deepEqual(response.progress, { is_opened: true, is_completed: false, first_opened_at: '2026-03-29T12:00:00.000Z', completed_at: null });
  assert.equal(deps.stores.projectStore['customer-1:project-1']?.status, 'IN_PROGRESS');
});

test('recordMentorProgress project submitted aceita delivery_url opcional', async () => {
  const deps = createProgressDeps();
  await recordMentorProgress({ mentorSlug: 'python', email: 'aluno@example.com', item_type: 'project', item_code: 'PJ-1', event: 'submitted' }, deps, new Date('2026-03-29T12:00:00.000Z'));
  assert.equal(deps.stores.projectStore['customer-1:project-1']?.status, 'SUBMITTED');
  assert.equal(deps.stores.projectStore['customer-1:project-1']?.delivery_url, null);

  const depsWithUrl = createProgressDeps();
  await recordMentorProgress({ mentorSlug: 'python', email: 'aluno@example.com', item_type: 'project', item_code: 'PJ-1', event: 'submitted', delivery_url: 'https://github.com/org/repo' }, depsWithUrl, new Date('2026-03-29T12:00:00.000Z'));
  assert.equal(depsWithUrl.stores.projectStore['customer-1:project-1']?.status, 'SUBMITTED');
  assert.equal(depsWithUrl.stores.projectStore['customer-1:project-1']?.submitted_at, '2026-03-29T12:00:00.000Z');
  assert.equal(depsWithUrl.stores.projectStore['customer-1:project-1']?.delivery_url, 'https://github.com/org/repo');
});

test('recordMentorProgress project approved exige evaluator_note e usa approved_at', async () => {
  const deps = createProgressDeps();
  const response = await recordMentorProgress({ mentorSlug: 'python', email: 'aluno@example.com', item_type: 'project', item_code: 'PJ-1', event: 'approved', evaluator_note: 'Projeto aprovado' }, deps, new Date('2026-03-29T12:00:00.000Z'));
  assert.deepEqual(response.progress, { is_opened: true, is_completed: true, first_opened_at: '2026-03-29T12:00:00.000Z', completed_at: '2026-03-29T12:00:00.000Z' });
  assert.equal(deps.stores.projectStore['customer-1:project-1']?.status, 'APPROVED');
  assert.equal(deps.stores.projectStore['customer-1:project-1']?.approved_at, '2026-03-29T12:00:00.000Z');
  assert.equal(deps.stores.projectStore['customer-1:project-1']?.evaluator_note, 'Projeto aprovado');
});

test('recordMentorProgress project rejected exige evaluator_note e usa rejected_at', async () => {
  const deps = createProgressDeps();
  const response = await recordMentorProgress({ mentorSlug: 'python', email: 'aluno@example.com', item_type: 'project', item_code: 'PJ-1', event: 'rejected', evaluator_note: 'Refaça a estrutura' }, deps, new Date('2026-03-29T12:00:00.000Z'));
  assert.deepEqual(response.progress, { is_opened: true, is_completed: false, first_opened_at: '2026-03-29T12:00:00.000Z', completed_at: null });
  assert.equal(deps.stores.projectStore['customer-1:project-1']?.status, 'REJECTED');
  assert.equal(deps.stores.projectStore['customer-1:project-1']?.rejected_at, '2026-03-29T12:00:00.000Z');
  assert.equal(deps.stores.projectStore['customer-1:project-1']?.evaluator_note, 'Refaça a estrutura');
});

test('recordMentorProgress conflito de unicidade faz fallback para update sem duplicar', async () => {
  const deps = createProgressDeps({ projectInsertConflictOnce: true });
  const response = await recordMentorProgress({ mentorSlug: 'python', email: 'aluno@example.com', item_type: 'project', item_code: 'PJ-1', event: 'approved', evaluator_note: 'Conflito resolvido' }, deps, new Date('2026-03-29T12:00:00.000Z'));
  assert.deepEqual(response.progress, { is_opened: true, is_completed: true, first_opened_at: '2026-03-29T12:00:00.000Z', completed_at: '2026-03-29T12:00:00.000Z' });
  assert.equal(Object.keys(deps.stores.projectStore).length, 1);
  assert.equal(deps.stores.projectStore['customer-1:project-1']?.status, 'APPROVED');
  assert.equal(deps.stores.projectStore['customer-1:project-1']?.evaluator_note, 'Conflito resolvido');
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

test('recordMentorProgress rejeita completed para checkpoint', async () => {
  await assert.rejects(() => recordMentorProgress({ mentorSlug: 'python', email: 'aluno@example.com', item_type: 'checkpoint', item_code: 'CP-1', event: 'completed' }, createProgressDeps()), (error: unknown) => {
    assert.ok(error instanceof ProgressError);
    assert.equal(error.statusCode, 400);
    assert.equal(error.error, 'invalid_event');
    return true;
  });
});

test('recordMentorProgress rejeita approved sem evaluator_note para checkpoint', async () => {
  await assert.rejects(() => recordMentorProgress({ mentorSlug: 'python', email: 'aluno@example.com', item_type: 'checkpoint', item_code: 'CP-1', event: 'approved' }, createProgressDeps()), (error: unknown) => {
    assert.ok(error instanceof ProgressError);
    assert.equal(error.statusCode, 400);
    assert.equal(error.error, 'missing_evaluator_note');
    return true;
  });
});

test('recordMentorProgress rejeita completed para project', async () => {
  await assert.rejects(() => recordMentorProgress({ mentorSlug: 'python', email: 'aluno@example.com', item_type: 'project', item_code: 'PJ-1', event: 'completed' }, createProgressDeps()), (error: unknown) => {
    assert.ok(error instanceof ProgressError);
    assert.equal(error.statusCode, 400);
    assert.equal(error.error, 'invalid_event');
    return true;
  });
});

test('recordMentorProgress rejeita approved sem evaluator_note para project', async () => {
  await assert.rejects(() => recordMentorProgress({ mentorSlug: 'python', email: 'aluno@example.com', item_type: 'project', item_code: 'PJ-1', event: 'approved' }, createProgressDeps()), (error: unknown) => {
    assert.ok(error instanceof ProgressError);
    assert.equal(error.statusCode, 400);
    assert.equal(error.error, 'missing_evaluator_note');
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

test('recordMentorProgress lesson opened e completed preserva first_opened_at e completed_at em reenvio', async () => {
  const deps = createProgressDeps();
  await recordMentorProgress({ mentorSlug: 'python', email: 'aluno@example.com', item_type: 'lesson', item_code: 'PY-INI-01-01', event: 'opened' }, deps, new Date('2026-03-20T10:00:00.000Z'));
  const completed = await recordMentorProgress({ mentorSlug: 'python', email: 'aluno@example.com', item_type: 'lesson', item_code: 'PY-INI-01-01', event: 'completed' }, deps, new Date('2026-03-21T10:00:00.000Z'));
  const replay = await recordMentorProgress({ mentorSlug: 'python', email: 'aluno@example.com', item_type: 'lesson', item_code: 'PY-INI-01-01', event: 'completed' }, deps, new Date('2026-03-22T10:00:00.000Z'));

  assert.deepEqual(completed.progress, { is_opened: true, is_completed: true, first_opened_at: '2026-03-20T10:00:00.000Z', completed_at: '2026-03-21T10:00:00.000Z' });
  assert.deepEqual(replay.progress, { is_opened: true, is_completed: true, first_opened_at: '2026-03-20T10:00:00.000Z', completed_at: '2026-03-21T10:00:00.000Z' });
});

test('recordMentorProgress checkpoint fluxo real opened submitted approved preserva submitted_at e first_opened_at', async () => {
  const deps = createProgressDeps();
  await recordMentorProgress({ mentorSlug: 'python', email: 'aluno@example.com', item_type: 'checkpoint', item_code: 'CP-1', event: 'opened' }, deps, new Date('2026-03-20T10:00:00.000Z'));
  await recordMentorProgress({ mentorSlug: 'python', email: 'aluno@example.com', item_type: 'checkpoint', item_code: 'CP-1', event: 'submitted' }, deps, new Date('2026-03-21T10:00:00.000Z'));
  const approved = await recordMentorProgress({ mentorSlug: 'python', email: 'aluno@example.com', item_type: 'checkpoint', item_code: 'CP-1', event: 'approved', evaluator_note: 'Tudo certo' }, deps, new Date('2026-03-22T10:00:00.000Z'));

  assert.deepEqual(approved.progress, { is_opened: true, is_completed: true, first_opened_at: '2026-03-20T10:00:00.000Z', completed_at: '2026-03-22T10:00:00.000Z' });
  assert.equal(deps.stores.checkpointStore['customer-1:checkpoint-1']?.submitted_at, '2026-03-21T10:00:00.000Z');
  assert.equal(deps.stores.checkpointStore['customer-1:checkpoint-1']?.approved_at, '2026-03-22T10:00:00.000Z');
});

test('recordMentorProgress checkpoint opened apos approved nao regride status', async () => {
  const deps = createProgressDeps();
  await recordMentorProgress({ mentorSlug: 'python', email: 'aluno@example.com', item_type: 'checkpoint', item_code: 'CP-1', event: 'approved', evaluator_note: 'Tudo certo' }, deps, new Date('2026-03-20T10:00:00.000Z'));
  const reopened = await recordMentorProgress({ mentorSlug: 'python', email: 'aluno@example.com', item_type: 'checkpoint', item_code: 'CP-1', event: 'opened' }, deps, new Date('2026-03-21T10:00:00.000Z'));

  assert.deepEqual(reopened.progress, { is_opened: true, is_completed: true, first_opened_at: '2026-03-20T10:00:00.000Z', completed_at: '2026-03-20T10:00:00.000Z' });
  assert.equal(deps.stores.checkpointStore['customer-1:checkpoint-1']?.status, 'APPROVED');
});

test('recordMentorProgress project fluxo real opened in_progress submitted approved preserva timeline e delivery_url', async () => {
  const deps = createProgressDeps();
  await recordMentorProgress({ mentorSlug: 'python', email: 'aluno@example.com', item_type: 'project', item_code: 'PJ-1', event: 'opened' }, deps, new Date('2026-03-20T10:00:00.000Z'));
  await recordMentorProgress({ mentorSlug: 'python', email: 'aluno@example.com', item_type: 'project', item_code: 'PJ-1', event: 'in_progress' }, deps, new Date('2026-03-21T10:00:00.000Z'));
  await recordMentorProgress({ mentorSlug: 'python', email: 'aluno@example.com', item_type: 'project', item_code: 'PJ-1', event: 'submitted', delivery_url: 'https://github.com/org/repo-v1' }, deps, new Date('2026-03-22T10:00:00.000Z'));
  const approved = await recordMentorProgress({ mentorSlug: 'python', email: 'aluno@example.com', item_type: 'project', item_code: 'PJ-1', event: 'approved', evaluator_note: 'Projeto aprovado' }, deps, new Date('2026-03-23T10:00:00.000Z'));

  assert.deepEqual(approved.progress, { is_opened: true, is_completed: true, first_opened_at: '2026-03-20T10:00:00.000Z', completed_at: '2026-03-23T10:00:00.000Z' });
  assert.equal(deps.stores.projectStore['customer-1:project-1']?.submitted_at, '2026-03-22T10:00:00.000Z');
  assert.equal(deps.stores.projectStore['customer-1:project-1']?.delivery_url, 'https://github.com/org/repo-v1');
  assert.equal(deps.stores.projectStore['customer-1:project-1']?.approved_at, '2026-03-23T10:00:00.000Z');
});

test('recordMentorProgress project opened apos approved nao regride status', async () => {
  const deps = createProgressDeps();
  await recordMentorProgress({ mentorSlug: 'python', email: 'aluno@example.com', item_type: 'project', item_code: 'PJ-1', event: 'approved', evaluator_note: 'Projeto aprovado' }, deps, new Date('2026-03-20T10:00:00.000Z'));
  const reopened = await recordMentorProgress({ mentorSlug: 'python', email: 'aluno@example.com', item_type: 'project', item_code: 'PJ-1', event: 'opened' }, deps, new Date('2026-03-21T10:00:00.000Z'));

  assert.deepEqual(reopened.progress, { is_opened: true, is_completed: true, first_opened_at: '2026-03-20T10:00:00.000Z', completed_at: '2026-03-20T10:00:00.000Z' });
  assert.equal(deps.stores.projectStore['customer-1:project-1']?.status, 'APPROVED');
});
