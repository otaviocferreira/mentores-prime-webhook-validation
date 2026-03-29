import test from 'node:test';
import assert from 'node:assert/strict';
import { CatalogError, getMentorCatalog, normalizeCatalogLevel } from '../services/catalog.service';

function createCatalogDeps(options?: { emptyCatalog?: boolean; brokenLessons?: boolean; withEmptyNodes?: boolean }) {
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
    { id: 'module-mas-1', level_id: 'level-mas', module_code: 'MAS-01', title: 'Lideranca tecnica', order_index: 1 }
  ];

  if (options?.withEmptyNodes) {
    modules.push(
      { id: 'module-pro-empty', level_id: 'level-pro', module_code: 'PRO-99', title: 'Vazio', order_index: 99 },
      { id: 'module-mas-empty', level_id: 'level-mas', module_code: 'MAS-99', title: 'Sem conteudo', order_index: 99 }
    );
  }

  const lessons = options?.emptyCatalog
    ? []
    : [
        { id: 'lesson-ini-1', level_id: 'level-ini', module_id: 'module-ini-1', lesson_code: 'INI-L1', title: 'Introducao', order_index: 1, is_extra: false },
        { id: 'lesson-ini-2', level_id: 'level-ini', module_id: 'module-ini-2', lesson_code: 'INI-L2', title: 'Variaveis', order_index: 1, is_extra: true },
        { id: 'lesson-int-1', level_id: 'level-int', module_id: 'module-int-1', lesson_code: 'INT-L1', title: 'Listas', order_index: 1, is_extra: false },
        { id: 'lesson-adv-1', level_id: 'level-adv', module_id: options?.brokenLessons ? 'module-nao-existe' : 'module-adv-1', lesson_code: 'ADV-L1', title: 'Threads', order_index: 1, is_extra: false },
        { id: 'lesson-pro-1', level_id: 'level-pro', module_id: 'module-pro-1', lesson_code: 'PRO-L1', title: 'DDD', order_index: 1, is_extra: false },
        { id: 'lesson-mas-1', level_id: 'level-mas', module_id: 'module-mas-1', lesson_code: 'MAS-L1', title: 'Mentoria', order_index: 1, is_extra: false }
      ];

  const checkpoints = options?.emptyCatalog
    ? []
    : [
        { id: 'checkpoint-ini-1', level_id: 'level-ini', module_id: 'module-ini-1', checkpoint_code: 'INI-C1', title: 'Revisao', order_index: 1 },
        { id: 'checkpoint-int-1', level_id: 'level-int', module_id: 'module-int-1', checkpoint_code: 'INT-C1', title: 'Colecoes checkpoint', order_index: 1 }
      ];

  const projects = options?.emptyCatalog
    ? []
    : [
        { id: 'project-adv-1', level_id: 'level-adv', module_id: 'module-adv-1', project_code: 'ADV-P1', title: 'Projeto concorrencia', project_type: 'pratico', order_index: 1 },
        { id: 'project-pro-1', level_id: 'level-pro', module_id: 'module-pro-1', project_code: 'PRO-P1', title: 'Projeto arquitetura', project_type: 'portfolio', order_index: 1 }
      ];

  return {
    async findActiveMentorBySlug() {
      return { id: 'mentor-1', slug: 'java', name: 'Java Mentor', active: true };
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
    async listPublishedLessonsByMentorId(_mentorId: string, levelIds: string[], moduleIds: string[]) {
      if (options?.brokenLessons) {
        return lessons.filter((lesson) => levelIds.includes(lesson.level_id));
      }
      return lessons.filter((lesson) => levelIds.includes(lesson.level_id) && moduleIds.includes(lesson.module_id));
    },
    async listPublishedCheckpointsByMentorId(_mentorId: string, levelIds: string[], moduleIds: string[]) {
      return checkpoints.filter((checkpoint) => levelIds.includes(checkpoint.level_id) && moduleIds.includes(checkpoint.module_id));
    },
    async listPublishedProjectsByMentorId(_mentorId: string, levelIds: string[], moduleIds: string[]) {
      return projects.filter((project) => levelIds.includes(project.level_id) && moduleIds.includes(project.module_id));
    },
    async listLessonProgress(_customerId: string, lessonIds: string[]) {
      const statusMap: Record<string, string> = {
        'lesson-ini-1': 'OPENED',
        'lesson-ini-2': 'IN_PROGRESS',
        'lesson-int-1': 'NOT_STARTED',
        'lesson-pro-1': 'COMPLETED'
      };
      return lessonIds.filter((lessonId) => statusMap[lessonId]).map((lessonId) => ({ lesson_id: lessonId, status: statusMap[lessonId] as any }));
    },
    async listCheckpointProgress(_customerId: string, checkpointIds: string[]) {
      const statusMap: Record<string, string> = {
        'checkpoint-ini-1': 'OPENED',
        'checkpoint-int-1': 'APPROVED'
      };
      return checkpointIds.filter((checkpointId) => statusMap[checkpointId]).map((checkpointId) => ({ checkpoint_id: checkpointId, status: statusMap[checkpointId] as any }));
    },
    async listProjectProgress(_customerId: string, projectIds: string[]) {
      const statusMap: Record<string, string> = {
        'project-adv-1': 'SUBMITTED',
        'project-pro-1': 'APPROVED'
      };
      return projectIds.filter((projectId) => statusMap[projectId]).map((projectId) => ({ project_id: projectId, status: statusMap[projectId] as any }));
    }
  };
}

test('normalizeCatalogLevel aceita aliases previstos', () => {
  const cases = [
    ['INI', 'INI'],
    ['iniciante', 'INI'],
    ['INT', 'INT'],
    ['intermediario', 'INT'],
    ['intermediário', 'INT'],
    ['ADV', 'ADV'],
    ['avancado', 'ADV'],
    ['avançado', 'ADV'],
    ['PRO', 'PRO'],
    ['profissional', 'PRO'],
    ['MAS', 'MAS'],
    ['maestria', 'MAS']
  ] as const;

  for (const [input, expected] of cases) {
    assert.equal(normalizeCatalogLevel(input), expected);
  }
});

test('getMentorCatalog deriva flags de lesson/checkpoint/project a partir do status real', async () => {
  const response = await getMentorCatalog({ mentorSlug: 'java', email: '  ALUNO@example.com  ' }, createCatalogDeps());

  assert.equal(response.levels[0]?.modules[0]?.lessons[0]?.progress.is_opened, true);
  assert.equal(response.levels[0]?.modules[0]?.lessons[0]?.progress.is_completed, false);
  assert.equal(response.levels[0]?.modules[1]?.lessons[0]?.progress.is_opened, true);
  assert.equal(response.levels[0]?.modules[1]?.lessons[0]?.progress.is_completed, false);
  assert.equal(response.levels[1]?.modules[0]?.lessons[0]?.progress.is_opened, false);
  assert.equal(response.levels[1]?.modules[0]?.lessons[0]?.progress.is_completed, false);
  assert.equal(response.levels[1]?.modules[0]?.checkpoints[0]?.progress.is_opened, true);
  assert.equal(response.levels[1]?.modules[0]?.checkpoints[0]?.progress.is_completed, true);
  assert.equal(response.levels[2]?.modules[0]?.projects[0]?.progress.is_opened, true);
  assert.equal(response.levels[2]?.modules[0]?.projects[0]?.progress.is_completed, false);
  assert.equal(response.levels[3]?.modules[0]?.projects[0]?.progress.is_completed, true);
});

test('getMentorCatalog retorna false false quando nao existe linha de progresso', async () => {
  const response = await getMentorCatalog({ mentorSlug: 'java', email: 'aluno@example.com' }, createCatalogDeps());
  assert.deepEqual(response.levels[4]?.modules[0]?.lessons[0]?.progress, { is_opened: false, is_completed: false });
});

test('getMentorCatalog retorna catalogo completo ordenado', async () => {
  const response = await getMentorCatalog({ mentorSlug: 'java', email: 'aluno@example.com' }, createCatalogDeps());
  assert.deepEqual(response.levels.map((level) => level.code), ['INI', 'INT', 'ADV', 'PRO', 'MAS']);
  assert.deepEqual(response.levels[0]?.modules.map((module) => module.module_code), ['INI-01', 'INI-02']);
  assert.equal(response.levels[0]?.modules[1]?.lessons[0]?.is_extra, true);
});

test('getMentorCatalog filtra corretamente por cada codigo de level', async () => {
  const deps = createCatalogDeps();
  const levels = ['INI', 'INT', 'ADV', 'PRO', 'MAS'] as const;
  for (const level of levels) {
    const response = await getMentorCatalog({ mentorSlug: 'java', email: 'aluno@example.com', level }, deps);
    assert.equal(response.level_filter, level);
    assert.deepEqual(response.levels.map((item) => item.code), [level]);
  }
});

test('getMentorCatalog aceita aliases de level', async () => {
  const deps = createCatalogDeps();
  const cases = [
    ['iniciante', 'INI'],
    ['intermediario', 'INT'],
    ['intermediário', 'INT'],
    ['avancado', 'ADV'],
    ['avançado', 'ADV'],
    ['profissional', 'PRO'],
    ['maestria', 'MAS']
  ] as const;
  for (const [alias, expected] of cases) {
    const response = await getMentorCatalog({ mentorSlug: 'java', email: 'aluno@example.com', level: alias }, deps);
    assert.equal(response.level_filter, expected);
    assert.deepEqual(response.levels.map((item) => item.code), [expected]);
  }
});

test('getMentorCatalog remove modulos sem conteudo e niveis sem modulos restantes', async () => {
  const response = await getMentorCatalog({ mentorSlug: 'java', email: 'aluno@example.com' }, createCatalogDeps({ withEmptyNodes: true }));
  const proLevel = response.levels.find((level) => level.code === 'PRO');
  const masLevel = response.levels.find((level) => level.code === 'MAS');
  assert.deepEqual(proLevel?.modules.map((module) => module.module_code), ['PRO-01']);
  assert.deepEqual(masLevel?.modules.map((module) => module.module_code), ['MAS-01']);
});

test('getMentorCatalog retorna 400 quando email esta ausente', async () => {
  await assert.rejects(() => getMentorCatalog({ mentorSlug: 'java' }, createCatalogDeps()), (error: unknown) => {
    assert.ok(error instanceof CatalogError);
    assert.equal(error.statusCode, 400);
    assert.equal(error.error, 'missing_email');
    return true;
  });
});

test('getMentorCatalog retorna 404 para customer ausente', async () => {
  await assert.rejects(() => getMentorCatalog({ mentorSlug: 'java', email: 'naoexiste@example.com' }, createCatalogDeps()), (error: unknown) => {
    assert.ok(error instanceof CatalogError);
    assert.equal(error.statusCode, 404);
    assert.equal(error.error, 'customer_not_found');
    return true;
  });
});

test('getMentorCatalog retorna 404 para mentor inativo ou inexistente', async () => {
  await assert.rejects(
    () => getMentorCatalog({ mentorSlug: 'java', email: 'aluno@example.com' }, { ...createCatalogDeps(), async findActiveMentorBySlug() { return null; } }),
    (error: unknown) => {
      assert.ok(error instanceof CatalogError);
      assert.equal(error.statusCode, 404);
      assert.equal(error.error, 'mentor_not_found');
      return true;
    }
  );
});

test('getMentorCatalog retorna 400 para level invalido', async () => {
  await assert.rejects(() => getMentorCatalog({ mentorSlug: 'java', email: 'aluno@example.com', level: 'senior' }, createCatalogDeps()), (error: unknown) => {
    assert.ok(error instanceof CatalogError);
    assert.equal(error.statusCode, 400);
    assert.equal(error.error, 'invalid_level');
    return true;
  });
});

test('getMentorCatalog retorna 404 quando catalogo esta vazio', async () => {
  await assert.rejects(() => getMentorCatalog({ mentorSlug: 'java', email: 'aluno@example.com' }, createCatalogDeps({ emptyCatalog: true })), (error: unknown) => {
    assert.ok(error instanceof CatalogError);
    assert.equal(error.statusCode, 404);
    assert.equal(error.error, 'catalog_not_found');
    return true;
  });
});

test('getMentorCatalog detecta inconsistencias de parent child', async () => {
  await assert.rejects(() => getMentorCatalog({ mentorSlug: 'java', email: 'aluno@example.com' }, createCatalogDeps({ brokenLessons: true })), (error: unknown) => {
    assert.ok(error instanceof CatalogError);
    assert.equal(error.statusCode, 500);
    assert.equal(error.error, 'catalog_integrity_error');
    return true;
  });
});
