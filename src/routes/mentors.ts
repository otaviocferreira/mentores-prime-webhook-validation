import { Router, Request, Response } from 'express';
import { supabase } from '../config/supabase';
import { validateApiKey } from '../utils/crypto';
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
  ProgressRow,
  ProgressError,
  ProgressUpsertInput,
  recordMentorProgress
} from '../services/progress.service';

type MentorsRouterDeps = CatalogServiceDeps & ProgressServiceDeps;

export function createMentorsRouter(deps: MentorsRouterDeps = mentorsDeps) {
  const router = Router();

  router.get('/:mentorSlug/catalog', async (req: Request, res: Response) => {
    try {
      const apiKey = req.headers['x-api-key'] as string;
      if (!apiKey || !validateApiKey(apiKey)) {
        return res.status(401).json({ error: 'Invalid API key' });
      }

      const response = await getMentorCatalog(
        {
          mentorSlug: req.params.mentorSlug,
          email: normalizeQueryValue(req.query.email),
          level: normalizeQueryValue(req.query.level)
        },
        deps
      );

      return res.json(response);
    } catch (error) {
      if (error instanceof CatalogError) {
        return res.status(error.statusCode).json({
          error: error.error,
          message: error.message
        });
      }

      console.error('Catalog error:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.post('/:mentorSlug/progress', async (req: Request, res: Response) => {
    try {
      const apiKey = req.headers['x-api-key'] as string;
      if (!apiKey || !validateApiKey(apiKey)) {
        return res.status(401).json({ error: 'Invalid API key' });
      }

      const response = await recordMentorProgress(
        {
          mentorSlug: req.params.mentorSlug,
          email: req.body?.email,
          item_type: req.body?.item_type,
          item_code: req.body?.item_code,
          event: req.body?.event
        },
        deps
      );

      return res.json(response);
    } catch (error) {
      if (error instanceof ProgressError) {
        return res.status(error.statusCode).json({
          error: error.error,
          message: error.message
        });
      }

      console.error('Progress error:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
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
      .select('lesson_id, is_opened, is_completed')
      .eq('customer_id', customerId)
      .in('lesson_id', lessonIds);

    if (error) throw error;
    return (data ?? []) as LessonProgressRow[];
  },

  async listCheckpointProgress(customerId: string, checkpointIds: string[]): Promise<CheckpointProgressRow[]> {
    if (checkpointIds.length === 0) return [];

    const { data, error } = await supabase
      .from('customer_checkpoint_progress')
      .select('checkpoint_id, is_opened, is_completed')
      .eq('customer_id', customerId)
      .in('checkpoint_id', checkpointIds);

    if (error) throw error;
    return (data ?? []) as CheckpointProgressRow[];
  },

  async listProjectProgress(customerId: string, projectIds: string[]): Promise<ProjectProgressRow[]> {
    if (projectIds.length === 0) return [];

    const { data, error } = await supabase
      .from('customer_project_progress')
      .select('project_id, is_opened, is_completed')
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

  async findLessonProgress(customerId: string, lessonId: string): Promise<ProgressRow | null> {
    const { data, error } = await supabase
      .from('customer_lesson_progress')
      .select('is_opened, is_completed, first_opened_at, completed_at')
      .eq('customer_id', customerId)
      .eq('lesson_id', lessonId)
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  async findCheckpointProgress(customerId: string, checkpointId: string): Promise<ProgressRow | null> {
    const { data, error } = await supabase
      .from('customer_checkpoint_progress')
      .select('is_opened, is_completed, first_opened_at, completed_at')
      .eq('customer_id', customerId)
      .eq('checkpoint_id', checkpointId)
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  async findProjectProgress(customerId: string, projectId: string): Promise<ProgressRow | null> {
    const { data, error } = await supabase
      .from('customer_project_progress')
      .select('is_opened, is_completed, first_opened_at, completed_at')
      .eq('customer_id', customerId)
      .eq('project_id', projectId)
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  async upsertLessonProgress(lessonId: string, input: ProgressUpsertInput): Promise<ProgressRow> {
    const { data, error } = await supabase
      .from('customer_lesson_progress')
      .upsert(
        {
          customer_id: input.customer_id,
          lesson_id: lessonId,
          is_opened: input.is_opened,
          is_completed: input.is_completed,
          first_opened_at: input.first_opened_at,
          completed_at: input.completed_at
        },
        { onConflict: 'customer_id,lesson_id' }
      )
      .select('is_opened, is_completed, first_opened_at, completed_at')
      .single();

    if (error) throw error;
    return data;
  },

  async upsertCheckpointProgress(checkpointId: string, input: ProgressUpsertInput): Promise<ProgressRow> {
    const { data, error } = await supabase
      .from('customer_checkpoint_progress')
      .upsert(
        {
          customer_id: input.customer_id,
          checkpoint_id: checkpointId,
          is_opened: input.is_opened,
          is_completed: input.is_completed,
          first_opened_at: input.first_opened_at,
          completed_at: input.completed_at
        },
        { onConflict: 'customer_id,checkpoint_id' }
      )
      .select('is_opened, is_completed, first_opened_at, completed_at')
      .single();

    if (error) throw error;
    return data;
  },

  async upsertProjectProgress(projectId: string, input: ProgressUpsertInput): Promise<ProgressRow> {
    const { data, error } = await supabase
      .from('customer_project_progress')
      .upsert(
        {
          customer_id: input.customer_id,
          project_id: projectId,
          is_opened: input.is_opened,
          is_completed: input.is_completed,
          first_opened_at: input.first_opened_at,
          completed_at: input.completed_at
        },
        { onConflict: 'customer_id,project_id' }
      )
      .select('is_opened, is_completed, first_opened_at, completed_at')
      .single();

    if (error) throw error;
    return data;
  }
};

export default createMentorsRouter();
