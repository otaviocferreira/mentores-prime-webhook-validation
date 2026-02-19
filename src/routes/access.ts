import { Router, Request, Response } from 'express';
import { supabase } from '../config/supabase';
import { validateApiKey } from '../utils/crypto';
import { AccessValidationResponse } from '../types';

const router = Router();

router.get('/validate', async (req: Request, res: Response) => {
  try {
    // Validar API Key
    const apiKey = req.headers['x-api-key'] as string;
    if (!apiKey || !validateApiKey(apiKey)) {
      return res.status(401).json({ error: 'Invalid API key' });
    }

    const { email, mentor } = req.query;

    if (!email || !mentor) {
      return res.status(400).json({ 
        error: 'Missing required parameters',
        required: ['email', 'mentor']
      });
    }

    const emailStr = email.toString().toLowerCase();
    const mentorStr = mentor.toString();

    // Buscar customer pelo email
    const { data: customer, error: customerError } = await supabase
      .from('customers')
      .select('id')
      .eq('email', emailStr)
      .single();

    if (customerError || !customer) {
      const response: AccessValidationResponse = {
        allowed: false,
        mentor: mentorStr,
        expires_at: null,
        source: 'product',
        plan: null
      };
      return res.json(response);
    }

    // Buscar customer_products ativos (status ACTIVE e não expirados)
    const { data: customerProducts, error: cpError } = await supabase
      .from('customer_products')
      .select('hotmart_product_id, expires_at')
      .eq('customer_id', customer.id)
      .eq('status', 'ACTIVE');

    if (cpError) {
      console.error('Error fetching customer_products:', cpError);
      return res.status(500).json({ error: 'Database error' });
    }

    const now = new Date();
    const activeProducts = (customerProducts || []).filter(cp => {
      if (!cp.expires_at) return true;
      return new Date(cp.expires_at) > now;
    });

    const activeProductIds = activeProducts.map(cp => cp.hotmart_product_id);

    if (activeProductIds.length === 0) {
      const response: AccessValidationResponse = {
        allowed: false,
        mentor: mentorStr,
        expires_at: null,
        source: 'product',
        plan: null,
        products: []
      };
      return res.json(response);
    }

    // Verificar mapeamentos de mentores para os produtos ativos
    const { data: mappedMentors, error: pmError } = await supabase
      .from('product_mentor_map')
      .select('hotmart_product_id')
      .in('hotmart_product_id', activeProductIds)
      .eq('mentor_slug', mentorStr);

    if (pmError) {
      console.error('Error fetching product_mentor_map:', pmError);
      return res.status(500).json({ error: 'Database error' });
    }

    const allowedProductIds = (mappedMentors || []).map(m => m.hotmart_product_id);
    const allowed = allowedProductIds.length > 0;

    let expiresAt: string | null = null;
    if (allowed) {
      const relevantProducts = activeProducts.filter(cp => allowedProductIds.includes(cp.hotmart_product_id));
      const hasLifetime = relevantProducts.some(cp => !cp.expires_at);
      if (hasLifetime) {
        expiresAt = null;
      } else {
        const maxDate = relevantProducts
          .map(cp => new Date(cp.expires_at as string))
          .reduce((a, b) => (a > b ? a : b));
        expiresAt = maxDate.toISOString();
      }
    }

    const response: AccessValidationResponse = {
      allowed,
      mentor: mentorStr,
      expires_at: expiresAt,
      source: 'product',
      plan: null,
      products: allowedProductIds
    };

    res.json(response);

  } catch (error) {
    console.error('Validation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;