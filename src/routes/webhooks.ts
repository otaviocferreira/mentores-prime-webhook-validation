import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { supabase } from '../config/supabase';
import { HotmartEvent } from '../types';
import { generateIdempotencyKey, validateHotmartToken } from '../utils/crypto';

const router = Router();

// Middleware para processar raw body e armazenar o corpo original
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
    } catch (error) {
      return res.status(400).json({ error: 'Invalid JSON body' });
    }
  } else {
    next();
  }
});

router.post('/hotmart', async (req: Request, res: Response) => {
  try {
    // Validar token do webhook (sem logar o token em texto puro)
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
    
    // Gerar idempotency key conforme estratégia definida
    let idempotencyKey: string;
    
    // Preferência 1: usar event.id se disponível
    if (event.id) {
      idempotencyKey = event.id;
      console.log(`Using event.id as idempotency key: ${idempotencyKey}`);
    } else {
      // Preferência 2: sha256(eventType + reference + rawBody)
      const eventType = event.event;
      const reference = event.data.purchase?.transaction || event.data.subscription?.subscriber?.code || '';
      const rawBody = (req as any).rawBody || JSON.stringify(req.body);
      
      const idempotencyData = `${eventType}-${reference}-${rawBody}`;
      idempotencyKey = crypto.createHash('sha256').update(idempotencyData).digest('hex');
      console.log(`Generated idempotency key from eventType+reference+rawBody: ${idempotencyKey}`);
    }

    // Verificar se já processamos esse evento (duplicado)
    const { data: existingEvent } = await supabase
      .from('hotmart_event_ledger_min')
      .select('id, processing_status')
      .eq('idempotency_key', idempotencyKey)
      .single();

    if (existingEvent) {
      console.log(`Duplicate event detected with idempotency key: ${idempotencyKey}`);
      return res.status(200).json({ 
        message: 'Event already processed',
        idempotency_key: idempotencyKey,
        duplicate: true,
        status: existingEvent.processing_status
      });
    }

    // Tentar processar o evento
    try {
      const result = await processHotmartEvent(event, idempotencyKey);
      
      // A função transacional já lida com duplicatas internamente
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
      res.status(200).json({ 
        message: 'Event processed successfully',
        idempotency_key: idempotencyKey,
        result: result
      });
      
    } catch (error: any) {
      console.error(`Error processing event ${idempotencyKey}:`, error);
      
      // Erros de validação devem retornar 4xx, erros de processamento 5xx
      if (error.message?.includes('Invalid') || error.message?.includes('Missing')) {
        return res.status(400).json({ 
          error: error.message,
          idempotency_key: idempotencyKey
        });
      }
      
      res.status(500).json({ 
        error: 'Failed to process event',
        idempotency_key: idempotencyKey
      });
    }

  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

async function processHotmartEvent(event: HotmartEvent, idempotencyKey: string): Promise<any> {
  try {
    // Validar dados obrigatórios do evento
    if (!event.event || !event.data?.buyer?.email) {
      throw new Error('Missing required event data: event type or buyer email');
    }
    
    // Mapear status da Hotmart para status interno
    const mappedStatus = mapHotmartStatus(event.event, event.data.purchase?.status);
    
    // Calcular data de expiração (1 ano para ACTIVE, ou usar next_charge_date se disponível)
    let expiresAt: string | null = null;
    if (mappedStatus === 'ACTIVE') {
      const nextChargeDate = event.data.subscription?.next_charge_date;
      if (nextChargeDate) {
        expiresAt = new Date(nextChargeDate).toISOString();
      } else {
        expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
      }
    }

    // Obter referência da Hotmart (transaction ou subscriber code)
    const hotmartReference = event.data.purchase?.transaction || 
                           event.data.subscription?.subscriber?.code || 
                           null;

    if (!hotmartReference) {
      console.warn(`No hotmart reference found for event ${idempotencyKey}, using email as fallback`);
    }

    // Extrair dados do produto
    const hpIdNum = event.data.product?.id;
    if (hpIdNum === undefined || hpIdNum === null) {
      throw new Error('Missing product ID from Hotmart event');
    }
    const hotmartProductId = parseInt(String(hpIdNum), 10);
    const ucode = event.data.product?.ucode || `unknown-${hotmartProductId}`;
    const productName = event.data.product?.name || `Produto Hotmart ${hotmartProductId}`;

    const buyerEmail = event.data.buyer.email.toLowerCase();

    // Upsert customer
    const { error: upsertCustomerError } = await supabase
      .from('customers')
      .upsert({ email: buyerEmail }, { onConflict: 'email' });
    if (upsertCustomerError) throw upsertCustomerError;

    const { data: customerRow, error: fetchCustomerError } = await supabase
      .from('customers')
      .select('id')
      .eq('email', buyerEmail)
      .single();
    if (fetchCustomerError || !customerRow) throw fetchCustomerError || new Error('Customer not found after upsert');

    // Upsert product
    const { error: upsertProductError } = await supabase
      .from('hotmart_products')
      .upsert({
        hotmart_product_id: hotmartProductId,
        ucode,
        name: productName,
        status: 'ACTIVE',
        is_subscription: true,
        active: true,
        updated_at: new Date().toISOString()
      }, { onConflict: 'hotmart_product_id' });
    if (upsertProductError) throw upsertProductError;

    // Upsert customer_products
    const { data: existingCp, error: fetchCpError } = await supabase
      .from('customer_products')
      .select('id, expires_at')
      .eq('customer_id', customerRow.id)
      .eq('hotmart_product_id', hotmartProductId)
      .single();
    if (fetchCpError && fetchCpError.code !== 'PGRST116') throw fetchCpError;

    const nowIso = new Date().toISOString();
    if (existingCp) {
      const newExpires = mappedStatus === 'ACTIVE' ? expiresAt : (existingCp.expires_at || nowIso);
      const { error: updateCpError } = await supabase
        .from('customer_products')
        .update({
          hotmart_reference: hotmartReference,
          status: mappedStatus,
          expires_at: newExpires,
          updated_at: nowIso
        })
        .eq('id', existingCp.id);
      if (updateCpError) throw updateCpError;
    } else {
      const { error: insertCpError } = await supabase
        .from('customer_products')
        .insert({
          customer_id: customerRow.id,
          hotmart_product_id: hotmartProductId,
          hotmart_reference: hotmartReference,
          status: mappedStatus,
          expires_at: mappedStatus === 'ACTIVE' ? expiresAt : nowIso,
          created_at: nowIso,
          updated_at: nowIso
        });
      if (insertCpError) throw insertCpError;
    }

    // Registrar no ledger mínimo
    const orderDate = event.data.purchase?.order_date ? new Date(event.data.purchase.order_date).toISOString() : null;
    const approvedDate = event.data.purchase?.approved_date ? new Date(event.data.purchase.approved_date).toISOString() : null;
    const nextCharge = event.data.subscription?.next_charge_date ? new Date(event.data.subscription.next_charge_date).toISOString() : null;

    const { error: insertLedgerError } = await supabase
      .from('hotmart_event_ledger_min')
      .insert({
        idempotency_key: idempotencyKey,
        event_type: event.event,
        hotmart_reference: hotmartReference,
        buyer_email: buyerEmail,
        product_id: String(hotmartProductId),
        offer_code: event.data.purchase?.offer?.code || null,
        plan_id: event.data.subscription?.plan?.id ? String(event.data.subscription.plan.id) : null,
        purchase_status: event.data.purchase?.status || null,
        subscription_status: event.data.subscription?.status || null,
        order_date: orderDate,
        approved_date: approvedDate,
        next_charge_date: nextCharge,
        processing_status: 'PROCESSED',
        processed_at: nowIso
      });
    if (insertLedgerError) throw insertLedgerError;

    const result = {
      status: 'processed',
      customer_id: customerRow.id,
      hotmart_product_id: hotmartProductId,
      hotmart_reference: hotmartReference,
      mapped_status: mappedStatus,
      expires_at: expiresAt
    };

    console.log(`Event ${idempotencyKey} processed successfully:`, result);
    return result;

  } catch (error) {
    console.error(`Error processing event ${idempotencyKey}:`, error);
    throw error;
  }
}

// Função para mapear eventos Hotmart para status internos (novo modelo)
function mapHotmartStatus(eventType: string, purchaseStatus: string): 'ACTIVE' | 'CANCELED' | 'REFUNDED' | 'CHARGEBACK' | 'PAST_DUE' | 'SUSPENDED' | 'TRIAL' | 'UNKNOWN' {
  if (eventType === 'PURCHASE_APPROVED' && purchaseStatus === 'APPROVED') return 'ACTIVE';
  if (eventType === 'PURCHASE_CANCELED' || purchaseStatus === 'CANCELED') return 'CANCELED';
  if (eventType === 'PURCHASE_REFUNDED' || purchaseStatus === 'REFUNDED') return 'REFUNDED';
  if (eventType === 'PURCHASE_PROTEST' || purchaseStatus === 'DISPUTE') return 'CHARGEBACK';
  if (eventType === 'SUBSCRIPTION_EXPIRED') return 'PAST_DUE';
  if (eventType === 'SUBSCRIPTION_SUSPENDED') return 'SUSPENDED';
  if (eventType === 'SUBSCRIPTION_TRIAL') return 'TRIAL';
  return 'UNKNOWN'; // Default para casos não mapeados
}



export default router;