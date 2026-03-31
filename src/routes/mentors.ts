import { Router, Request, Response } from 'express';
import { supabase } from '../config/supabase';
import { validateApiKey } from '../utils/crypto';
import { createDiagnosticLogger, maskEmail } from '../utils/request-log';
import {
  CatalogLevelRow,
  CatalogModuleRow,
  CatalogLessonRow,
  CatalogCheckpointRow,
  CatalogProjectRow,
  CatalogMentorRow,
  CatalogCustomerRow,
  LessonProgressRow,
  CheckpointProgressRow,
  ProjectProgressRow,
  CatalogServiceDeps,
  CatalogError,
  getMentorCatalog
} from '../services/catalog.service';
import {
  ProgressServiceDeps,
  ProgressMentorRow,
  ProgressCustomerRow,
  ProgressItemRow,
  LessonProgressRow as LessonProgressStateRow,
  CheckpointProgressRow as CheckpointProgressStateRow,
  ProjectProgressRow as ProjectProgressStateRow,
  ProgressError,
  LessonProgressInsertInput,
  CheckpointProgressInsertInput,
  ProjectProgressInsertInput,
  LessonProgressUpdateInput,
  CheckpointProgressUpdateInput,
  ProjectProgressUpdateInput,
  recordMentorProgress
} from '../services/progress.service';

type MentorsRouterDeps = CatalogServiceDeps & ProgressServiceDeps;

export function createMentorsRouter(deps: MentorsRouterDeps = mentorsDeps) {
  const router = Router();

  router.get('/:mentorSlug/catalog', async (req: Request, res: Response) => {
    const logger = createDiagnosticLogger({ method: req.method, endpoint: '/mentors/:mentorSlug/catalog' });
    logger.info('request_received', 'incoming request', {
      mentor_slug: req.params.mentorSlug,
      email: maskEmail(firstQueryValue(normalizeQueryValue(req.query.email))),
      level: normalizeQueryValue(req.query.level) ?? null
    });

    try {
      const apiKey = req.headers['x-api-key'] as string;
      if (!apiKey || !validateApiKey(apiKey)) {
        logger.info('auth', 'invalid api key', { status: 401 });
        return res.status(401).json({ error: 'Invalid API key' });
      }

      const response = await getMentorCatalog(
        {
          mentorSlug: req.params.mentorSlug,
          email: normalizeQueryValue(req.query.email),
          level: normalizeQueryValue(req.query.level)
        },
        deps,
        logger
      );

      logger.info('response', 'returning catalog response', { status: 200, levels: response.levels.length, level_filter: response.level_filter ?? null });
      return res.json(response);
    } catch (error) {
      if (error instanceof CatalogError) {
        logger.error('catalog_handler', error, { status: error.statusCode, error_code: error.error });
        return res.status(error.statusCode).json({
          error: error.error,
          message: error.message
        });
      }

      logger.error('catalog_handler', error, { status: 500 });
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.post('/:mentorSlug/progress', async (req: Request, res: Response) => {
    const logger = createDiagnosticLogger({ method: req.method, endpoint: '/mentors/:mentorSlug/progress' });
    logger.info('request_received', 'incoming request', {
      mentor_slug: req.params.mentorSlug,
      email: maskEmail(typeof req.body?.email === 'string' ? req.body.email : undefined),
      item_type: req.body?.item_type ?? null,
      item_code: req.body?.item_code ?? null,
      event: req.body?.event ?? null,
      evaluator_note_present: typeof req.body?.evaluator_note === 'string' ? req.body.evaluator_note.trim().length > 0 : false,
      delivery_url_present: typeof req.body?.delivery_url === 'string' ? req.body.delivery_url.trim().length > 0 : false
    });

    try {
      const apiKey = req.headers['x-api-key'] as string;
      if (!apiKey || !validateApiKey(apiKey)) {
        logger.info('auth', 'invalid api key', { status: 401 });
        return res.status(401).json({ error: 'Invalid API key' });
      }

      const response = await recordMentorProgress(
        {
          mentorSlug: req.params.mentorSlug,
          email: req.body?.email,
          item_type: req.body?.item_type,
          item_code: req.body?.item_code,
          event: req.body?.event,
          evaluator_note: req.body?.evaluator_note,
          delivery_url: req.body?.delivery_url
        },
        deps,
        new Date(),
        logger
      );

      logger.info('response', 'returning progress response', { status: 200, item_type: response.item_type, event: response.event });
      return res.json(response);
    } catch (error) {
      if (error instanceof ProgressError) {
        logger.error('progress_handler', error, { status: error.statusCode, error_code: error.error });
        return res.status(error.statusCode).json({
          error: error.error,
          message: error.message
        });
      }

      logger.error('progress_handler', error, { status: 500 });
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}

function firstQueryValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeQueryValue(value: unknown): string | string[] | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }
  return undefined;
}

const mentorsDeps: MentorsRouterDeps = {
  async findActiveMentorBySlug(mentorSlug: string): Promise<CatalogMentorRow & ProgressMentorRow | null> {
    const { data, error } = await supabase
      .from('mentors')
      .select('id, slug, name, active')
      .eq('slug', mentorSlug)
      .eq('active', true)
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  async findCustomerByEmail(email: string): Promise<CatalogCustomerRow & ProgressCustomerRow | null> {
    const { data, error } = await supabase
      .from('customers')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  async listActiveLevelsByMentorId(mentorId: string): Promise<CatalogLevelRow[]> {
    const { data, error } = await supabase
      .from('mentor_levels')
      .select('id, code, name, order_index')
      .eq('mentor_id', mentorId)
      .eq('active', true)
      .order('order_index', { ascending: true });

    if (error) throw error;
    return (data ?? []) as CatalogLevelRow[];
  },

  async listActiveModulesByMentorId(mentorId: string, levelIds: string[]): Promise<CatalogModuleRow[]> {
    if (levelIds.length === 0) return [];

    const { data, error } = await supabase
      .from('mentor_modules')
      .select('id, level_id, module_code, title, order_index')
      .eq('mentor_id', mentorId)
      .eq('active', true)
      .in('level_id', levelIds)
      .order('order_index', { ascending: true });

    if (error) throw error;
    return (data ?? []) as CatalogModuleRow[];
  },

  async listPublishedLessonsByMentorId(
    mentorId: string,
    levelIds: string[],
    moduleIds: string[]
  ): Promise<CatalogLessonRow[]> {
    if (levelIds.length === 0 || moduleIds.length === 0) return [];

    const { data, error } = await supabase
      .from('mentor_lessons')
      .select('id, level_id, module_id, lesson_code, title, order_index, is_extra')
      .eq('mentor_id', mentorId)
      .eq('active', true)
      .eq('published', true)
      .in('level_id', levelIds)
      .in('module_id', moduleIds)
      .order('order_index', { ascending: true });

    if (error) throw error;
    return (data ?? []) as CatalogLessonRow[];
  },

  async listPublishedCheckpointsByMentorId(
    mentorId: string,
    levelIds: string[],
    moduleIds: string[]
  ): Promise<CatalogCheckpointRow[]> {
    if (levelIds.length === 0 || moduleIds.length === 0) return [];

    const { data, error } = await supabase
      .from('mentor_module_checkpoints')
      .select('id, level_id, module_id, checkpoint_code, title, order_index')
      .eq('mentor_id', mentorId)
      .eq('active', true)
      .eq('published', true)
      .in('level_id', levelIds)
      .in('module_id', moduleIds)
      .order('order_index', { ascending: true });

    if (error) throw error;
    return (data ?? []) as CatalogCheckpointRow[];
  },

  async listPublishedProjectsByMentorId(
    mentorId: string,
    levelIds: string[],
    moduleIds: string[]
  ): Promise<CatalogProjectRow[]> {
    if (levelIds.length === 0 || moduleIds.length === 0) return [];

    const { data, error } = await supabase
      .from('mentor_module_projects')
      .select('id, level_id, module_id, project_code, title, project_type, order_index')
      .eq('mentor_id', mentorId)
      .eq('active', true)
      .eq('published', true)
      .in('level_id', levelIds)
      .in('module_id', moduleIds)
      .order('order_index', { ascending: true });

    if (error) throw error;
    return (data ?? []) as CatalogProjectRow[];
  },

  async listLessonProgress(customerId: string, lessonIds: string[]): Promise<LessonProgressRow[]> {
    if (lessonIds.length === 0) return [];

    const { data, error } = await supabase
      .from('customer_lesson_progress')
      .select('lesson_id, status')
      .eq('customer_id', customerId)
      .in('lesson_id', lessonIds);

    if (error) throw error;
    return (data ?? []) as LessonProgressRow[];
  },

  async listCheckpointProgress(customerId: string, checkpointIds: string[]): Promise<CheckpointProgressRow[]> {
    if (checkpointIds.length === 0) return [];

    const { data, error } = await supabase
      .from('customer_checkpoint_progress')
      .select('checkpoint_id, status')
      .eq('customer_id', customerId)
      .in('checkpoint_id', checkpointIds);

    if (error) throw error;
    return (data ?? []) as CheckpointProgressRow[];
  },

  async listProjectProgress(customerId: string, projectIds: string[]): Promise<ProjectProgressRow[]> {
    if (projectIds.length === 0) return [];

    const { data, error } = await supabase
      .from('customer_project_progress')
      .select('project_id, status')
      .eq('customer_id', customerId)
      .in('project_id', projectIds);

    if (error) throw error;
    return (data ?? []) as ProjectProgressRow[];
  },

  async findLessonByCode(itemCode: string): Promise<ProgressItemRow | null> {
    const { data, error } = await supabase
      .from('mentor_lessons')
      .select('id, mentor_id')
      .eq('lesson_code', itemCode)
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  async findCheckpointByCode(itemCode: string): Promise<ProgressItemRow | null> {
    const { data, error } = await supabase
      .from('mentor_module_checkpoints')
      .select('id, mentor_id')
      .eq('checkpoint_code', itemCode)
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  async findProjectByCode(itemCode: string): Promise<ProgressItemRow | null> {
    const { data, error } = await supabase
      .from('mentor_module_projects')
      .select('id, mentor_id')
      .eq('project_code', itemCode)
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  async findLessonProgress(customerId: string, lessonId: string): Promise<LessonProgressStateRow | null> {
    const { data, error } = await supabase
      .from('customer_lesson_progress')
      .select('status, first_opened_at, last_opened_at, completed_at')
      .eq('customer_id', customerId)
      .eq('lesson_id', lessonId)
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  async findCheckpointProgress(customerId: string, checkpointId: string): Promise<CheckpointProgressStateRow | null> {
    const { data, error } = await supabase
      .from('customer_checkpoint_progress')
      .select('status, first_opened_at, last_opened_at, submitted_at, approved_at, rejected_at, evaluator_note')
      .eq('customer_id', customerId)
      .eq('checkpoint_id', checkpointId)
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  async findProjectProgress(customerId: string, projectId: string): Promise<ProjectProgressStateRow | null> {
    const { data, error } = await supabase
      .from('customer_project_progress')
      .select('status, first_opened_at, last_opened_at, submitted_at, approved_at, rejected_at, delivery_url, evaluator_note')
      .eq('customer_id', customerId)
      .eq('project_id', projectId)
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  async insertLessonProgress(lessonId: string, input: LessonProgressInsertInput): Promise<LessonProgressStateRow> {
    const { data, error } = await supabase
      .from('customer_lesson_progress')
      .insert({
        customer_id: input.customer_id,
        mentor_id: input.mentor_id,
        lesson_id: lessonId,
        status: input.status,
        first_opened_at: input.first_opened_at,
        last_opened_at: input.last_opened_at,
        completed_at: input.completed_at
      })
      .select('status, first_opened_at, last_opened_at, completed_at')
      .single();

    if (error) throw error;
    return data;
  },

  async updateLessonProgress(
    lessonId: string,
    customerId: string,
    input: LessonProgressUpdateInput
  ): Promise<LessonProgressStateRow> {
    const { data, error } = await supabase
      .from('customer_lesson_progress')
      .update({
        mentor_id: input.mentor_id,
        status: input.status,
        first_opened_at: input.first_opened_at,
        last_opened_at: input.last_opened_at,
        completed_at: input.completed_at
      })
      .eq('customer_id', customerId)
      .eq('lesson_id', lessonId)
      .select('status, first_opened_at, last_opened_at, completed_at')
      .single();

    if (error) throw error;
    return data;
  },

  async insertCheckpointProgress(
    checkpointId: string,
    input: CheckpointProgressInsertInput
  ): Promise<CheckpointProgressStateRow> {
    const { data, error } = await supabase
      .from('customer_checkpoint_progress')
      .insert({
        customer_id: input.customer_id,
        mentor_id: input.mentor_id,
        checkpoint_id: checkpointId,
        status: input.status,
        first_opened_at: input.first_opened_at,
        last_opened_at: input.last_opened_at,
        submitted_at: input.submitted_at,
        approved_at: input.approved_at,
        rejected_at: input.rejected_at,
        evaluator_note: input.evaluator_note
      })
      .select('status, first_opened_at, last_opened_at, submitted_at, approved_at, rejected_at, evaluator_note')
      .single();

    if (error) throw error;
    return data;
  },

  async updateCheckpointProgress(
    checkpointId: string,
    customerId: string,
    input: CheckpointProgressUpdateInput
  ): Promise<CheckpointProgressStateRow> {
    const { data, error } = await supabase
      .from('customer_checkpoint_progress')
      .update({
        mentor_id: input.mentor_id,
        status: input.status,
        first_opened_at: input.first_opened_at,
        last_opened_at: input.last_opened_at,
        submitted_at: input.submitted_at,
        approved_at: input.approved_at,
        rejected_at: input.rejected_at,
        evaluator_note: input.evaluator_note
      })
      .eq('customer_id', customerId)
      .eq('checkpoint_id', checkpointId)
      .select('status, first_opened_at, last_opened_at, submitted_at, approved_at, rejected_at, evaluator_note')
      .single();

    if (error) throw error;
    return data;
  },

  async insertProjectProgress(projectId: string, input: ProjectProgressInsertInput): Promise<ProjectProgressStateRow> {
    const { data, error } = await supabase
      .from('customer_project_progress')
      .insert({
        customer_id: input.customer_id,
        mentor_id: input.mentor_id,
        project_id: projectId,
        status: input.status,
        first_opened_at: input.first_opened_at,
        last_opened_at: input.last_opened_at,
        submitted_at: input.submitted_at,
        approved_at: input.approved_at,
        rejected_at: input.rejected_at,
        delivery_url: input.delivery_url,
        evaluator_note: input.evaluator_note
      })
      .select('status, first_opened_at, last_opened_at, submitted_at, approved_at, rejected_at, delivery_url, evaluator_note')
      .single();

    if (error) throw error;
    return data;
  },

  async updateProjectProgress(
    projectId: string,
    customerId: string,
    input: ProjectProgressUpdateInput
  ): Promise<ProjectProgressStateRow> {
    const { data, error } = await supabase
      .from('customer_project_progress')
      .update({
        mentor_id: input.mentor_id,
        status: input.status,
        first_opened_at: input.first_opened_at,
        last_opened_at: input.last_opened_at,
        submitted_at: input.submitted_at,
        approved_at: input.approved_at,
        rejected_at: input.rejected_at,
        delivery_url: input.delivery_url,
        evaluator_note: input.evaluator_note
      })
      .eq('customer_id', customerId)
      .eq('project_id', projectId)
      .select('status, first_opened_at, last_opened_at, submitted_at, approved_at, rejected_at, delivery_url, evaluator_note')
      .single();

    if (error) throw error;
    return data;
  }
};

export default createMentorsRouter();





