import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { AddressInfo } from 'node:net';
import { createMentorsRouter } from '../routes/mentors';
import { CatalogResponse } from '../services/catalog.service';

type LessonRow = { status: 'NOT_STARTED' | 'OPENED' | 'IN_PROGRESS' | 'COMPLETED'; first_opened_at: string | null; last_opened_at: string | null; completed_at: string | null };
type CheckpointRow = { status: 'NOT_STARTED' | 'OPENED' | 'SUBMITTED' | 'APPROVED' | 'REJECTED'; first_opened_at: string | null; last_opened_at: string | null; submitted_at: string | null; approved_at: string | null; rejected_at: string | null; evaluator_note: string | null };
type ProjectRow = { status: 'NOT_STARTED' | 'OPENED' | 'IN_PROGRESS' | 'SUBMITTED' | 'APPROVED' | 'REJECTED'; first_opened_at: string | null; last_opened_at: string | null; submitted_at: string | null; approved_at: string | null; rejected_at: string | null; delivery_url: string | null; evaluator_note: string | null };

function createDeps(options?: { emptyCatalog?: boolean; brokenCatalog?: boolean; withEmptyNodes?: boolean }): any {
  const lessonStore = new Map<string, LessonRow>();
  const checkpointStore = new Map<string, CheckpointRow>();
  const projectStore = new Map<string, ProjectRow>();

  const mentors = {
    java: { id: 'mentor-java', slug: 'java', name: 'Java Mentor', active: true },
    python: { id: 'mentor-python', slug: 'python', name: 'Python Mentor', active: true }
  };

  const levels = [
    { id: 'level-ini', code: 'INI' as const, name: 'Iniciante', order_index: 1 },
    { id: 'level-int', code: 'INT' as const, name: 'Intermediario', order_index: 2 },
    { id: 'level-adv', code: 'ADV' as const, name: 'Avancado', order_index: 3 },
    { id: 'level-pro', code: 'PRO' as const, name: 'Profissional', order_index: 4 },
    { id: 'level-mas', code: 'MAS' as const, name: 'Maestria', order_index: 5 }
  ];

  const modules = [
    { id: 'module-ini-2', level_id: 'level-ini', module_code: 'INI-02', title: 'Sintaxe', order_index: 2 },
    { id: 'module-ini-1', level_id: 'level-ini', module_code: 'INI-01', title: 'Boas-vindas', order_index: 1 },
    { id: 'module-int-1', level_id: 'level-int', module_code: 'INT-01', title: 'Colecoes', order_index: 1 },
    { id: 'module-adv-1', level_id: 'level-adv', module_code: 'ADV-01', title: 'Concorrencia', order_index: 1 },
    { id: 'module-pro-1', level_id: 'level-pro', module_code: 'PRO-01', title: 'Arquitetura', order_index: 1 },
    { id: 'module-mas-1', level_id: 'level-mas', module_code: 'MAS-01', title: 'Mentoria', order_index: 1 }
  ];

  if (options?.withEmptyNodes) {
    modules.push(
      { id: 'module-pro-empty', level_id: 'level-pro', module_code: 'PRO-99', title: 'Vazio', order_index: 99 },
      { id: 'module-mas-empty', level_id: 'level-mas', module_code: 'MAS-99', title: 'Sem conteudo', order_index: 99 }
    );
  }

  const lessons = options?.emptyCatalog ? [] : [
    { id: 'lesson-ini-1', mentor_id: 'mentor-java', level_id: 'level-ini', module_id: 'module-ini-1', lesson_code: 'JAVA-INI-01-01', title: 'Introducao', order_index: 1, is_extra: false },
    { id: 'lesson-ini-2', mentor_id: 'mentor-java', level_id: 'level-ini', module_id: 'module-ini-2', lesson_code: 'JAVA-INI-02-01', title: 'Variaveis', order_index: 1, is_extra: true },
    { id: 'lesson-int-1', mentor_id: 'mentor-java', level_id: 'level-int', module_id: 'module-int-1', lesson_code: 'JAVA-INT-01-01', title: 'Listas', order_index: 1, is_extra: false },
    { id: 'lesson-adv-1', mentor_id: 'mentor-java', level_id: 'level-adv', module_id: options?.brokenCatalog ? 'module-nao-existe' : 'module-adv-1', lesson_code: 'JAVA-ADV-01-01', title: 'Threads', order_index: 1, is_extra: false },
    { id: 'lesson-pro-1', mentor_id: 'mentor-java', level_id: 'level-pro', module_id: 'module-pro-1', lesson_code: 'JAVA-PRO-01-01', title: 'DDD', order_index: 1, is_extra: false },
    { id: 'lesson-mas-1', mentor_id: 'mentor-java', level_id: 'level-mas', module_id: 'module-mas-1', lesson_code: 'JAVA-MAS-01-01', title: 'Mentoria', order_index: 1, is_extra: false },
    { id: 'lesson-py-1', mentor_id: 'mentor-python', level_id: 'level-ini', module_id: 'module-ini-1', lesson_code: 'PY-INI-01-01', title: 'Primeira aula Python', order_index: 1, is_extra: false }
  ];

  const checkpoints = options?.emptyCatalog ? [] : [
    { id: 'checkpoint-int-1', mentor_id: 'mentor-java', level_id: 'level-int', module_id: 'module-int-1', checkpoint_code: 'JAVA-INT-CP-01', title: 'Checkpoint de colecoes', order_index: 1 },
    { id: 'checkpoint-py-1', mentor_id: 'mentor-python', level_id: 'level-ini', module_id: 'module-ini-1', checkpoint_code: 'CP-1', title: 'Checkpoint Python', order_index: 1 }
  ];

  const projects = options?.emptyCatalog ? [] : [
    { id: 'project-adv-1', mentor_id: 'mentor-java', level_id: 'level-adv', module_id: 'module-adv-1', project_code: 'JAVA-ADV-PJ-01', title: 'Projeto concorrencia', project_type: 'pratico', order_index: 1 },
    { id: 'project-py-1', mentor_id: 'mentor-python', level_id: 'level-ini', module_id: 'module-ini-1', project_code: 'PJ-1', title: 'Projeto Python', project_type: 'portfolio', order_index: 1 }
  ];

  const deps = {
    stores: { lessonStore, checkpointStore, projectStore },
    async findActiveMentorBySlug(mentorSlug: string) {
      return mentors[mentorSlug as keyof typeof mentors] ?? null;
    },
    async findCustomerByEmail(email: string) {
      return email === 'aluno@example.com' ? { id: 'customer-1' } : null;
    },
    async listActiveLevelsByMentorId() {
      return levels;
    },
    async listActiveModulesByMentorId(_mentorId: string, levelIds: string[]) {
      return modules.filter((module) => levelIds.includes(module.level_id));
    },
    async listPublishedLessonsByMentorId(mentorId: string, levelIds: string[], moduleIds: string[]) {
      if (options?.brokenCatalog) {
        return lessons.filter((lesson) => lesson.mentor_id === mentorId && levelIds.includes(lesson.level_id));
      }
      return lessons.filter((lesson) => lesson.mentor_id === mentorId && levelIds.includes(lesson.level_id) && moduleIds.includes(lesson.module_id));
    },
    async listPublishedCheckpointsByMentorId(mentorId: string, levelIds: string[], moduleIds: string[]) {
      return checkpoints.filter((checkpoint) => checkpoint.mentor_id === mentorId && levelIds.includes(checkpoint.level_id) && moduleIds.includes(checkpoint.module_id));
    },
    async listPublishedProjectsByMentorId(mentorId: string, levelIds: string[], moduleIds: string[]) {
      return projects.filter((project) => project.mentor_id === mentorId && levelIds.includes(project.level_id) && moduleIds.includes(project.module_id));
    },
    async listLessonProgress(customerId: string, lessonIds: string[]) {
      return lessonIds.filter((lessonId) => lessonStore.has(`${customerId}:${lessonId}`)).map((lessonId) => ({ lesson_id: lessonId, status: lessonStore.get(`${customerId}:${lessonId}`)!.status }));
    },
    async listCheckpointProgress(customerId: string, checkpointIds: string[]) {
      return checkpointIds.filter((checkpointId) => checkpointStore.has(`${customerId}:${checkpointId}`)).map((checkpointId) => ({ checkpoint_id: checkpointId, status: checkpointStore.get(`${customerId}:${checkpointId}`)!.status }));
    },
    async listProjectProgress(customerId: string, projectIds: string[]) {
      return projectIds.filter((projectId) => projectStore.has(`${customerId}:${projectId}`)).map((projectId) => ({ project_id: projectId, status: projectStore.get(`${customerId}:${projectId}`)!.status }));
    },
    async findLessonByCode(itemCode: string) {
      const lesson = lessons.find((item) => item.lesson_code === itemCode);
      return lesson ? { id: lesson.id, mentor_id: lesson.mentor_id } : null;
    },
    async findCheckpointByCode(itemCode: string) {
      const checkpoint = checkpoints.find((item) => item.checkpoint_code === itemCode);
      return checkpoint ? { id: checkpoint.id, mentor_id: checkpoint.mentor_id } : null;
    },
    async findProjectByCode(itemCode: string) {
      const project = projects.find((item) => item.project_code === itemCode);
      return project ? { id: project.id, mentor_id: project.mentor_id } : null;
    },
    async findLessonProgress(customerId: string, lessonId: string) {
      return lessonStore.get(`${customerId}:${lessonId}`) ?? null;
    },
    async findCheckpointProgress(customerId: string, checkpointId: string) {
      return checkpointStore.get(`${customerId}:${checkpointId}`) ?? null;
    },
    async findProjectProgress(customerId: string, projectId: string) {
      return projectStore.get(`${customerId}:${projectId}`) ?? null;
    },
    async insertLessonProgress(lessonId: string, input: any) {
      const key = `${input.customer_id}:${lessonId}`;
      const value = { status: input.status, first_opened_at: input.first_opened_at, last_opened_at: input.last_opened_at, completed_at: input.completed_at } as LessonRow;
      lessonStore.set(key, value);
      return value;
    },
    async updateLessonProgress(lessonId: string, customerId: string, input: any) {
      const key = `${customerId}:${lessonId}`;
      const value = { status: input.status, first_opened_at: input.first_opened_at, last_opened_at: input.last_opened_at, completed_at: input.completed_at } as LessonRow;
      lessonStore.set(key, value);
      return value;
    },
    async insertCheckpointProgress(checkpointId: string, input: any) {
      const key = `${input.customer_id}:${checkpointId}`;
      const value = { status: input.status, first_opened_at: input.first_opened_at, last_opened_at: input.last_opened_at, submitted_at: input.submitted_at, approved_at: input.approved_at, rejected_at: input.rejected_at, evaluator_note: input.evaluator_note } as CheckpointRow;
      checkpointStore.set(key, value);
      return value;
    },
    async updateCheckpointProgress(checkpointId: string, customerId: string, input: any) {
      const key = `${customerId}:${checkpointId}`;
      const value = { status: input.status, first_opened_at: input.first_opened_at, last_opened_at: input.last_opened_at, submitted_at: input.submitted_at, approved_at: input.approved_at, rejected_at: input.rejected_at, evaluator_note: input.evaluator_note } as CheckpointRow;
      checkpointStore.set(key, value);
      return value;
    },
    async insertProjectProgress(projectId: string, input: any) {
      const key = `${input.customer_id}:${projectId}`;
      const value = { status: input.status, first_opened_at: input.first_opened_at, last_opened_at: input.last_opened_at, submitted_at: input.submitted_at, approved_at: input.approved_at, rejected_at: input.rejected_at, delivery_url: input.delivery_url, evaluator_note: input.evaluator_note } as ProjectRow;
      projectStore.set(key, value);
      return value;
    },
    async updateProjectProgress(projectId: string, customerId: string, input: any) {
      const key = `${customerId}:${projectId}`;
      const value = { status: input.status, first_opened_at: input.first_opened_at, last_opened_at: input.last_opened_at, submitted_at: input.submitted_at, approved_at: input.approved_at, rejected_at: input.rejected_at, delivery_url: input.delivery_url, evaluator_note: input.evaluator_note } as ProjectRow;
      projectStore.set(key, value);
      return value;
    }
  };

  return deps;
}

async function withServer(deps: ReturnType<typeof createDeps>, run: (baseUrl: string, deps: ReturnType<typeof createDeps>) => Promise<void>) {
  const app = express();
  app.use(express.json());
  app.use('/mentors', createMentorsRouter(deps));
  const originalApiKey = process.env.API_KEY;
  process.env.API_KEY = 'test-api-key';
  const server = await new Promise<import('node:http').Server>((resolve) => {
    const instance = app.listen(0, () => resolve(instance));
  });

  try {
    const { port } = server.address() as AddressInfo;
    await run(`http://127.0.0.1:${port}`, deps);
  } finally {
    process.env.API_KEY = originalApiKey;
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

test('GET /mentors/:mentorSlug/catalog retorna 401 sem API key valida', async () => {
  await withServer(createDeps(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/mentors/java/catalog?email=aluno@example.com`);
    const body = (await response.json()) as { error: string };
    assert.equal(response.status, 401);
    assert.deepEqual(body, { error: 'Invalid API key' });
  });
});

test('GET /mentors/:mentorSlug/catalog retorna catalogo completo ordenado', async () => {
  const deps = createDeps();
  deps.stores.lessonStore.set('customer-1:lesson-ini-1', { status: 'OPENED', first_opened_at: null, last_opened_at: null, completed_at: null });
  deps.stores.checkpointStore.set('customer-1:checkpoint-int-1', { status: 'APPROVED', first_opened_at: null, last_opened_at: null, submitted_at: null, approved_at: '2026-03-29T12:00:00.000Z', rejected_at: null, evaluator_note: null });
  deps.stores.projectStore.set('customer-1:project-adv-1', { status: 'SUBMITTED', first_opened_at: null, last_opened_at: null, submitted_at: null, approved_at: null, rejected_at: null, delivery_url: null, evaluator_note: null });

  await withServer(deps, async (baseUrl) => {
    const response = await fetch(baseUrl + '/mentors/java/catalog?email=aluno@example.com', { headers: { 'x-api-key': 'test-api-key' } });
    const body = (await response.json()) as CatalogResponse;
    assert.equal(response.status, 200);
    assert.deepEqual(body.levels.map((level) => level.code), ['INI', 'INT', 'ADV', 'PRO', 'MAS']);
    assert.deepEqual(body.levels[0]?.modules.map((module) => module.module_code), ['INI-01', 'INI-02']);
    assert.equal(body.levels[0]?.modules[1]?.lessons[0]?.is_extra, true);
  });
});

test('GET /mentors/:mentorSlug/catalog aceita codigos e aliases de level', async () => {
  await withServer(createDeps(), async (baseUrl) => {
    const cases = [['INI', 'INI'], ['INT', 'INT'], ['ADV', 'ADV'], ['PRO', 'PRO'], ['MAS', 'MAS'], ['iniciante', 'INI'], ['intermediario', 'INT'], ['intermediário', 'INT'], ['avancado', 'ADV'], ['avançado', 'ADV'], ['profissional', 'PRO'], ['maestria', 'MAS']] as const;
    for (const [input, expected] of cases) {
      const response = await fetch(`${baseUrl}/mentors/java/catalog?email=aluno@example.com&level=${encodeURIComponent(input)}`, { headers: { 'x-api-key': 'test-api-key' } });
      const body = (await response.json()) as CatalogResponse;
      assert.equal(response.status, 200);
      assert.equal(body.level_filter, expected);
      assert.deepEqual(body.levels.map((level) => level.code), [expected]);
    }
  });
});

test('GET /mentors/:mentorSlug/catalog remove modulos vazios e niveis sem modulos restantes', async () => {
  await withServer(createDeps({ withEmptyNodes: true }), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/mentors/java/catalog?email=aluno@example.com`, { headers: { 'x-api-key': 'test-api-key' } });
    const body = (await response.json()) as CatalogResponse;
    assert.deepEqual(body.levels.find((level) => level.code === 'PRO')?.modules.map((module) => module.module_code), ['PRO-01']);
    assert.deepEqual(body.levels.find((level) => level.code === 'MAS')?.modules.map((module) => module.module_code), ['MAS-01']);
  });
});

test('GET /mentors/:mentorSlug/catalog deriva flags a partir do status real e usa false/false sem linha', async () => {
  const deps = createDeps();
  deps.stores.lessonStore.set('customer-1:lesson-ini-1', { status: 'OPENED', first_opened_at: null, last_opened_at: null, completed_at: null });
  deps.stores.lessonStore.set('customer-1:lesson-int-1', { status: 'NOT_STARTED', first_opened_at: null, last_opened_at: null, completed_at: null });
  deps.stores.checkpointStore.set('customer-1:checkpoint-int-1', { status: 'REJECTED', first_opened_at: null, last_opened_at: null, submitted_at: null, approved_at: null, rejected_at: '2026-03-29T12:00:00.000Z', evaluator_note: null });
  deps.stores.projectStore.set('customer-1:project-adv-1', { status: 'APPROVED', first_opened_at: null, last_opened_at: null, submitted_at: null, approved_at: '2026-03-29T12:00:00.000Z', rejected_at: null, delivery_url: null, evaluator_note: null });

  await withServer(deps, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/mentors/java/catalog?email=aluno@example.com`, { headers: { 'x-api-key': 'test-api-key' } });
    const body = (await response.json()) as CatalogResponse;
    assert.deepEqual(body.levels[0]?.modules[0]?.lessons[0]?.progress, { is_opened: true, is_completed: false });
    assert.deepEqual(body.levels[1]?.modules[0]?.lessons[0]?.progress, { is_opened: false, is_completed: false });
    assert.deepEqual(body.levels[1]?.modules[0]?.checkpoints[0]?.progress, { is_opened: true, is_completed: false });
    assert.deepEqual(body.levels[2]?.modules[0]?.projects[0]?.progress, { is_opened: true, is_completed: true });
    assert.deepEqual(body.levels[4]?.modules[0]?.lessons[0]?.progress, { is_opened: false, is_completed: false });
  });
});

test('GET /mentors/:mentorSlug/catalog retorna erros esperados', async () => {
  await withServer(createDeps(), async (baseUrl) => {
    const cases = [
      [`${baseUrl}/mentors/java/catalog`, 400, { error: 'missing_email', message: 'Missing required query parameter: email' }],
      [`${baseUrl}/mentors/java/catalog?email=aluno@example.com&level=senior`, 400, { error: 'invalid_level', message: 'Invalid level filter' }],
      [`${baseUrl}/mentors/ruby/catalog?email=aluno@example.com`, 404, { error: 'mentor_not_found', message: 'Active mentor not found' }],
      [`${baseUrl}/mentors/java/catalog?email=outro@example.com`, 404, { error: 'customer_not_found', message: 'Customer not found' }]
    ] as const;
    for (const [url, expectedStatus, expectedBody] of cases) {
      const response = await fetch(url, { headers: { 'x-api-key': 'test-api-key' } });
      const body = await response.json();
      assert.equal(response.status, expectedStatus);
      assert.deepEqual(body, expectedBody);
    }
  });
});

test('GET /mentors/:mentorSlug/catalog retorna 404 para catalogo vazio e 500 para inconsistencias', async () => {
  await withServer(createDeps({ emptyCatalog: true }), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/mentors/java/catalog?email=aluno@example.com`, { headers: { 'x-api-key': 'test-api-key' } });
    const body = await response.json();
    assert.equal(response.status, 404);
    assert.deepEqual(body, { error: 'catalog_not_found', message: 'No published catalog found for this mentor' });
  });

  await withServer(createDeps({ brokenCatalog: true }), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/mentors/java/catalog?email=aluno@example.com`, { headers: { 'x-api-key': 'test-api-key' } });
    const body = await response.json();
    assert.equal(response.status, 500);
    assert.deepEqual(body, { error: 'catalog_integrity_error', message: 'Catalog contains lessons linked to an invalid parent' });
  });
});

test('POST /mentors/:mentorSlug/progress retorna 401 sem API key valida', async () => {
  await withServer(createDeps(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/mentors/python/progress`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'aluno@example.com', item_type: 'lesson', item_code: 'PY-INI-01-01', event: 'opened' }) });
    const body = await response.json();
    assert.equal(response.status, 401);
    assert.deepEqual(body, { error: 'Invalid API key' });
  });
});

test('POST /mentors/:mentorSlug/progress persiste status corretos para todos os tipos', async () => {
  await withServer(createDeps(), async (baseUrl, deps) => {
    const cases = [
      [{ item_type: 'lesson', item_code: 'PY-INI-01-01', event: 'opened' }, 'customer-1:lesson-py-1', deps.stores.lessonStore, 'OPENED'],
      [{ item_type: 'lesson', item_code: 'PY-INI-01-01', event: 'completed' }, 'customer-1:lesson-py-1', deps.stores.lessonStore, 'COMPLETED'],
      [{ item_type: 'checkpoint', item_code: 'CP-1', event: 'opened' }, 'customer-1:checkpoint-py-1', deps.stores.checkpointStore, 'OPENED'],
      [{ item_type: 'checkpoint', item_code: 'CP-1', event: 'completed' }, 'customer-1:checkpoint-py-1', deps.stores.checkpointStore, 'APPROVED'],
      [{ item_type: 'project', item_code: 'PJ-1', event: 'opened' }, 'customer-1:project-py-1', deps.stores.projectStore, 'OPENED'],
      [{ item_type: 'project', item_code: 'PJ-1', event: 'completed' }, 'customer-1:project-py-1', deps.stores.projectStore, 'APPROVED']
    ] as const;

    for (const [payload, key, store, expectedStatus] of cases) {
      const response = await fetch(`${baseUrl}/mentors/python/progress`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': 'test-api-key' }, body: JSON.stringify({ email: 'aluno@example.com', ...payload }) });
      const body = (await response.json()) as { progress: { is_opened: boolean; is_completed: boolean } };
      assert.equal(response.status, 200);
      assert.equal(store.get(key)?.status, expectedStatus);
      assert.equal(body.progress.is_opened, true);
      assert.equal(body.progress.is_completed, payload.event === 'completed');
    }
  });
});

test('POST /mentors/:mentorSlug/progress chamadas repetidas mantem consistencia sem duplicar', async () => {
  await withServer(createDeps(), async (baseUrl, deps) => {
    await fetch(`${baseUrl}/mentors/python/progress`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': 'test-api-key' }, body: JSON.stringify({ email: 'aluno@example.com', item_type: 'project', item_code: 'PJ-1', event: 'completed' }) });
    await fetch(`${baseUrl}/mentors/python/progress`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': 'test-api-key' }, body: JSON.stringify({ email: 'aluno@example.com', item_type: 'project', item_code: 'PJ-1', event: 'completed' }) });
    assert.equal(deps.stores.projectStore.size, 1);
    assert.equal(deps.stores.projectStore.get('customer-1:project-py-1')?.status, 'APPROVED');
  });
});

test('POST /mentors/:mentorSlug/progress retorna erros esperados', async () => {
  await withServer(createDeps(), async (baseUrl) => {
    const cases = [
      [{ email: '', item_type: 'lesson', item_code: '', event: 'opened' }, 400, { error: 'invalid_body', message: 'Invalid request body' }],
      [{ email: 'aluno@example.com', item_type: 'module', item_code: 'X', event: 'opened' }, 400, { error: 'invalid_item_type', message: 'Invalid item_type' }],
      [{ email: 'aluno@example.com', item_type: 'lesson', item_code: 'PY-INI-01-01', event: 'finish' }, 400, { error: 'invalid_event', message: 'Invalid event' }],
      [{ email: 'outro@example.com', item_type: 'lesson', item_code: 'PY-INI-01-01', event: 'opened' }, 404, { error: 'customer_not_found', message: 'Customer not found' }],
      [{ email: 'aluno@example.com', item_type: 'lesson', item_code: 'NAO-EXISTE', event: 'opened' }, 404, { error: 'item_not_found', message: 'Item not found' }]
    ] as const;

    for (const [payload, expectedStatus, expectedBody] of cases) {
      const response = await fetch(`${baseUrl}/mentors/python/progress`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': 'test-api-key' }, body: JSON.stringify(payload) });
      const body = await response.json();
      assert.equal(response.status, expectedStatus);
      assert.deepEqual(body, expectedBody);
    }
  });
});

test('POST /mentors/:mentorSlug/progress retorna 400 quando item pertence a outro mentor', async () => {
  await withServer(createDeps(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/mentors/java/progress`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': 'test-api-key' }, body: JSON.stringify({ email: 'aluno@example.com', item_type: 'lesson', item_code: 'PY-INI-01-01', event: 'opened' }) });
    const body = await response.json();
    assert.equal(response.status, 400);
    assert.deepEqual(body, { error: 'item_mentor_mismatch', message: 'Item does not belong to the informed mentor' });
  });
});

test('POST opened/completed e GET catalog refletem progresso derivado', async () => {
  await withServer(createDeps(), async (baseUrl) => {
    await fetch(`${baseUrl}/mentors/python/progress`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': 'test-api-key' }, body: JSON.stringify({ email: 'aluno@example.com', item_type: 'lesson', item_code: 'PY-INI-01-01', event: 'opened' }) });
    await fetch(`${baseUrl}/mentors/python/progress`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': 'test-api-key' }, body: JSON.stringify({ email: 'aluno@example.com', item_type: 'checkpoint', item_code: 'CP-1', event: 'completed' }) });
    await fetch(`${baseUrl}/mentors/python/progress`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': 'test-api-key' }, body: JSON.stringify({ email: 'aluno@example.com', item_type: 'project', item_code: 'PJ-1', event: 'completed' }) });

    const response = await fetch(`${baseUrl}/mentors/python/catalog?email=aluno@example.com`, { headers: { 'x-api-key': 'test-api-key' } });
    const body = (await response.json()) as CatalogResponse;
    assert.deepEqual(body.levels[0]?.modules[0]?.lessons[0]?.progress, { is_opened: true, is_completed: false });
    assert.deepEqual(body.levels[0]?.modules[0]?.checkpoints[0]?.progress, { is_opened: true, is_completed: true });
    assert.deepEqual(body.levels[0]?.modules[0]?.projects[0]?.progress, { is_opened: true, is_completed: true });
  });
});


