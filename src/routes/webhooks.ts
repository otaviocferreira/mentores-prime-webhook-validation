import { Router, Request, Response } from 'express';
import { supabase } from '../config/supabase';
import { HotmartEvent } from '../types';
import { validateHotmartToken } from '../utils/crypto';
import {
  generateWebhookIdempotencyKey,
  processHotmartEvent,
  ProductUpsertInput,
  CustomerProductInsertInput,
  CustomerProductUpdateInput,
  LedgerInsertInput
} from '../services/webhook.service';

const router = Router();

router.use('/hotmart', (req: Request, res: Response, next: import('express').NextFunction) => {
  if (req.method === 'POST') {
    try {
      const isBuffer = Buffer.isBuffer(req.body);
      const bodyStr = isBuffer
        ? req.body.toString('utf8')
        : typeof req.body === 'string'
          ? req.body
          : JSON.stringify(req.body);
      (req as any).rawBody = bodyStr;
      req.body = JSON.parse(bodyStr);
      next();
    } catch (_error) {
      return res.status(400).json({ error: 'Invalid JSON body' });
    }
  } else {
    next();
  }
});

router.post('/hotmart', async (req: Request, res: Response) => {
  try {
    const token = req.headers['x-hotmart-hottok'] as string;
    if (!token) {
      console.log('Webhook received without X-HOTMART-HOTTOK header');
      return res.status(401).json({ error: 'Missing authentication token' });
    }

    if (!validateHotmartToken(token)) {
      console.log('Webhook received with invalid X-HOTMART-HOTTOK header');
      return res.status(401).json({ error: 'Invalid authentication token' });
    }

    const event: HotmartEvent = req.body;
    const rawBody = (req as any).rawBody || JSON.stringify(req.body);
    const idempotencyKey = generateWebhookIdempotencyKey(event, rawBody);

    if (event.id) {
      console.log(`Using event.id as idempotency key: ${idempotencyKey}`);
    } else {
      console.log(`Generated idempotency key from eventType+reference+rawBody: ${idempotencyKey}`);
    }

    const { data: existingEvent, error: existingEventError } = await supabase
      .from('hotmart_event_ledger_min')
      .select('id, processing_status')
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();

    if (existingEventError) {
      throw existingEventError;
    }

    if (existingEvent) {
      console.log(`Duplicate event detected with idempotency key: ${idempotencyKey}`);
      return res.status(200).json({
        message: 'Event already processed',
        idempotency_key: idempotencyKey,
        duplicate: true,
        status: existingEvent.processing_status
      });
    }

    try {
      const result = await processHotmartEvent(event, idempotencyKey, webhookDeps);

      if (result.duplicate) {
        console.log(`Event processed as duplicate via transaction: ${idempotencyKey}`);
        return res.status(200).json({
          message: 'Event already processed',
          idempotency_key: idempotencyKey,
          duplicate: true,
          status: result.status
        });
      }

      console.log(`Event processed successfully: ${idempotencyKey}`);
      return res.status(200).json({
        message: 'Event processed successfully',
        idempotency_key: idempotencyKey,
        result
      });
    } catch (error: any) {
      console.error(`Error processing event ${idempotencyKey}:`, error);

      if (error.message?.includes('Invalid') || error.message?.includes('Missing')) {
        return res.status(400).json({
          error: error.message,
          idempotency_key: idempotencyKey
        });
      }

      return res.status(500).json({
        error: 'Failed to process event',
        idempotency_key: idempotencyKey
      });
    }
  } catch (error) {
    console.error('Webhook error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

const webhookDeps = {
  async upsertCustomer(email: string) {
    const { error } = await supabase
      .from('customers')
      .upsert({ email }, { onConflict: 'email' });
    if (error) throw error;
  },
  async findCustomerByEmail(email: string) {
    const { data, error } = await supabase
      .from('customers')
      .select('id')
      .eq('email', email)
      .single();

    if (error) throw error;
    return data;
  },
  async upsertProduct(input: ProductUpsertInput) {
    const { error } = await supabase
      .from('hotmart_products')
      .upsert(input, { onConflict: 'hotmart_product_id' });
    if (error) throw error;
  },
  async findCustomerProduct(customerId: string, productId: number) {
    const { data, error } = await supabase
      .from('customer_products')
      .select('id, expires_at')
      .eq('customer_id', customerId)
      .eq('hotmart_product_id', productId)
      .maybeSingle();

    if (error) throw error;
    return data;
  },
  async updateCustomerProduct(id: string, input: CustomerProductUpdateInput) {
    const { error } = await supabase
      .from('customer_products')
      .update(input)
      .eq('id', id);
    if (error) throw error;
  },
  async insertCustomerProduct(input: CustomerProductInsertInput) {
    const { error } = await supabase
      .from('customer_products')
      .insert(input);
    if (error) throw error;
  },
  async insertLedger(input: LedgerInsertInput) {
    const { error } = await supabase
      .from('hotmart_event_ledger_min')
      .insert(input);
    if (error) throw error;
  }
};

export default router;
