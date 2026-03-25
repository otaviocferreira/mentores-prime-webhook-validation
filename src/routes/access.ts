import { Router, Request, Response } from 'express';
import { supabase } from '../config/supabase';
import { validateApiKey } from '../utils/crypto';
import { validateAccess } from '../services/access.service';

const router = Router();

router.get('/validate', async (req: Request, res: Response) => {
  try {
    const apiKey = req.headers['x-api-key'] as string;
    if (!apiKey || !validateApiKey(apiKey)) {
      return res.status(401).json({ error: 'Invalid API key' });
    }

    try {
      const response = await validateAccess(
        {
          email: normalizeQueryValue(req.query.email),
          mentor: normalizeQueryValue(req.query.mentor)
        },
        accessDeps
      );
      return res.json(response);
    } catch (error: any) {
      if (error.message === 'Missing required parameters') {
        return res.status(400).json({
          error: 'Missing required parameters',
          required: ['email', 'mentor']
        });
      }

      throw error;
    }
  } catch (error) {
    console.error('Validation error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

function normalizeQueryValue(value: unknown): string | string[] | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }
  return undefined;
}

const accessDeps = {
  async findCustomerByEmail(email: string) {
    const { data, error } = await supabase
      .from('customers')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (error) throw error;
    return data;
  },
  async listActiveCustomerProducts(customerId: string) {
    const { data, error } = await supabase
      .from('customer_products')
      .select('hotmart_product_id, expires_at')
      .eq('customer_id', customerId)
      .eq('status', 'ACTIVE');

    if (error) throw error;
    return data || [];
  },
  async listMentorMappings(productIds: number[], mentor: string) {
    const { data, error } = await supabase
      .from('product_mentor_map')
      .select('hotmart_product_id')
      .in('hotmart_product_id', productIds)
      .eq('mentor_slug', mentor);

    if (error) throw error;
    return data || [];
  }
};

export default router;
