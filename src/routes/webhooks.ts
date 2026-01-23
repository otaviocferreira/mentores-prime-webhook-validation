import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { supabase } from '../config/supabase';
import { HotmartEvent, HotmartEventLedger } from '../types';
import { generateIdempotencyKey, validateHotmartToken } from '../utils/crypto';

const router = Router();

// Middleware para processar raw body e armazenar o corpo original
router.use('/hotmart', (req: Request, res: Response, next) => {
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
      .from('hotmart_event_ledger')
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

    // Tentar processar o evento com a função transacional
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
    
    // Determinar mentor_slugs baseado no produto/plano (regra de negócio)
    const mentorSlugs = determineMentorSlugs(event);
    
    // Calcular data de expiração (1 ano para ACTIVE, null para cancelamentos)
    const expiresAt = mappedStatus === 'ACTIVE' ? 
      new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString() : 
      null;

    // Obter referência da Hotmart (transaction ou subscriber code)
    const hotmartReference = event.data.purchase?.transaction || 
                           event.data.subscription?.subscriber?.code || 
                           null;

    if (!hotmartReference) {
      console.warn(`No hotmart reference found for event ${idempotencyKey}, using email as fallback`);
    }

    // Chamar função SQL transacional do usuário
    const { data, error } = await supabase
      .rpc('process_hotmart_event', {
        p_idempotency_key: idempotencyKey,
        p_event_type: event.event,
        p_hotmart_reference: hotmartReference,
        p_buyer_email: event.data.buyer.email,
        p_status: mappedStatus,
        p_mentor_slugs: mentorSlugs,
        p_expires_at: expiresAt,
        p_payload: event
      });

    if (error) {
      throw error;
    }

    console.log(`Event ${idempotencyKey} processed successfully:`, data);
    return data;

  } catch (error) {
    console.error(`Error processing event ${idempotencyKey}:`, error);
    throw error;
  }
}

// Função para mapear eventos Hotmart para status internos
function mapHotmartStatus(eventType: string, purchaseStatus: string): 'ACTIVE' | 'CANCELED' | 'REFUNDED' | 'CHARGEBACK' | 'EXPIRED' {
  if (eventType === 'PURCHASE_APPROVED' && purchaseStatus === 'APPROVED') return 'ACTIVE';
  if (eventType === 'PURCHASE_CANCELED' || purchaseStatus === 'CANCELED') return 'CANCELED';
  if (eventType === 'PURCHASE_REFUNDED' || purchaseStatus === 'REFUNDED') return 'REFUNDED';
  if (eventType === 'PURCHASE_PROTEST' || purchaseStatus === 'DISPUTE') return 'CHARGEBACK';
  if (eventType === 'SUBSCRIPTION_EXPIRED') return 'EXPIRED';
  return 'CANCELED'; // Default para casos não mapeados
}

// Função para determinar quais mentores liberar baseado no produto/plano
function determineMentorSlugs(event: HotmartEvent): string[] {
  // ESTRATÉGIA ATUAL: Um produto só libera acesso a TODOS os mentores
  // Futuramente, quando tiver trilhas específicas, modificar aqui
  
  const slugs: string[] = [];
  
  // Por enquanto, liberar acesso a todos os mentores disponíveis
  // Isso permite que o GPT valide acesso a qualquer mentor
  const allMentors = [
    'git',
    'logica',
    'sql',
    'nosql',
    'fundamentos-dados',
    'python',
    'python-data',
    'java',
    'spring',
    'spring-boot',
    'django',
    'html-css',
    'php',
    'laravel',
    'javascript',
    'typescript',
    'nodejs',
    'csharp',
    'dotnet-backend',
    'react',
    'angular',
    'javascript-web',
    'bootstrap',
    'wordpress',
    'deploy-web'
  ];
  
  // Para compras aprovadas, liberar todos os mentores
  const mappedStatus = mapHotmartStatus(event.event, event.data.purchase?.status);
  if (mappedStatus === 'ACTIVE') {
    return allMentors;
  }
  
  // Para status não ativos (cancelado, expirado, etc.), não liberar nenhum mentor
  // A função SQL process_hotmart_event vai tratar o status corretamente
  return slugs;
}

export default router;