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

    // Buscar acesso do cliente ao mentor
    // Primeiro buscar o customer pelo email
    const { data: customer, error: customerError } = await supabase
      .from('customers')
      .select('id')
      .eq('email', email.toString().toLowerCase())
      .single();

    if (customerError || !customer) {
      const response: AccessValidationResponse = {
        allowed: false,
        mentor: mentor.toString(),
        expires_at: null,
        source: 'hotmart',
        plan: null
      };
      return res.json(response);
    }

    // Agora buscar o mentor_access pelo customer_id
    const { data: access, error } = await supabase
      .from('mentor_access')
      .select('*')
      .eq('customer_id', customer.id)
      .eq('mentor_slug', mentor.toString())
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = not found
      console.error('Error fetching access:', error);
      return res.status(500).json({ error: 'Database error' });
    }

    // Se não encontrou acesso ou está expirado
    if (!access || (access.expires_at && new Date(access.expires_at) < new Date())) {
      const response: AccessValidationResponse = {
        allowed: false,
        mentor: mentor.toString(),
        expires_at: null,
        source: 'hotmart',
        plan: null
      };
      return res.json(response);
    }

    // Buscar subscription para obter o plano
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('plan_code')
      .eq('customer_id', customer.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    // Retornar dados de acesso no formato especificado
    const response: AccessValidationResponse = {
      allowed: access.allowed,
      mentor: access.mentor_slug,
      expires_at: access.expires_at,
      source: access.source,
      plan: subscription?.plan_code || null
    };

    res.json(response);

  } catch (error) {
    console.error('Validation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;