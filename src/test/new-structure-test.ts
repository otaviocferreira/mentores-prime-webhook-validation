// Teste completo com a nova estrutura SQL do usuário

import { supabase } from '../config/supabase';

// Dados reais da Hotmart fornecidos
const approvedEvent = {
  "id": "37c93564-229d-4177-8907-5ff33855426d",
  "creation_date": 1769198874113,
  "event": "PURCHASE_APPROVED",
  "version": "2.0.0",
  "data": {
    "product": {
      "id": 0,
      "ucode": "fb056612-bcc6-4217-9e6d-2a5d1110ac2f",
      "name": "Produto test postback2",
      "warranty_date": "2017-12-27T00:00:00Z",
      "support_email": "support@hotmart.com.br",
      "has_co_production": false,
      "is_physical_product": false
    },
    "buyer": {
      "email": "testeComprador271101postman15@example.com",
      "name": "Teste Comprador",
      "first_name": "Teste",
      "last_name": "Comprador",
      "document": "69526128664",
      "document_type": "CPF"
    },
    "purchase": {
      "transaction": "HP16015479281022",
      "status": "APPROVED",
      "price": {
        "value": 1500,
        "currency_value": "BRL"
      },
      "payment": {
        "installments_number": 12,
        "type": "CREDIT_CARD"
      },
      "offer": {
        "code": "test",
        "coupon_code": "SHHUHA"
      }
    },
    "subscription": {
      "status": "ACTIVE",
      "plan": {
        "id": 123,
        "name": "plano de teste"
      },
      "subscriber": {
        "code": "I9OT62C3"
      }
    }
  }
};

// Função auxiliar para mapear status (igual ao do webhook)
function mapHotmartStatus(eventType: string, purchaseStatus: string): string {
  if (eventType === 'PURCHASE_APPROVED' && purchaseStatus === 'APPROVED') return 'ACTIVE';
  if (eventType === 'PURCHASE_CANCELED' || purchaseStatus === 'CANCELED') return 'CANCELED';
  if (eventType === 'PURCHASE_REFUNDED' || purchaseStatus === 'REFUNDED') return 'REFUNDED';
  if (eventType === 'PURCHASE_PROTEST' || purchaseStatus === 'DISPUTE') return 'CHARGEBACK';
  if (eventType === 'SUBSCRIPTION_EXPIRED') return 'EXPIRED';
  return 'CANCELED';
}

// Função auxiliar para determinar mentor slugs
function determineMentorSlugs(event: any): string[] {
  const slugs: string[] = [];
  
  const productName = event.data.product.name.toLowerCase();
  const planName = event.data.subscription?.plan?.name.toLowerCase() || '';
  
  if (productName.includes('java') || planName.includes('java')) {
    slugs.push('java');
  }
  if (productName.includes('python') || planName.includes('python')) {
    slugs.push('python');
  }
  if (productName.includes('react') || planName.includes('react')) {
    slugs.push('react');
  }
  if (productName.includes('node') || planName.includes('node')) {
    slugs.push('node');
  }
  
  if (slugs.length === 0) {
    slugs.push('general');
  }
  
  return slugs;
}

// Testar a função transacional
async function testProcessHotmartEvent() {
  console.log('🧪 Testando função transacional com nova estrutura...');
  
  try {
    const idempotencyKey = `test-${approvedEvent.id}`;
    const mappedStatus = mapHotmartStatus(approvedEvent.event, approvedEvent.data.purchase.status);
    const mentorSlugs = determineMentorSlugs(approvedEvent);
    const expiresAt = mappedStatus === 'ACTIVE' ? 
      new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString() : 
      null;

    console.log('📋 Dados do teste:');
    console.log('- Idempotency Key:', idempotencyKey);
    console.log('- Event Type:', approvedEvent.event);
    console.log('- Hotmart Reference:', approvedEvent.data.purchase.transaction);
    console.log('- Buyer Email:', approvedEvent.data.buyer.email);
    console.log('- Status:', mappedStatus);
    console.log('- Mentor Slugs:', mentorSlugs);
    console.log('- Expires At:', expiresAt);

    // Chamar a função transacional
    const { data, error } = await supabase
      .rpc('process_hotmart_event', {
        p_idempotency_key: idempotencyKey,
        p_event_type: approvedEvent.event,
        p_hotmart_reference: approvedEvent.data.purchase.transaction,
        p_buyer_email: approvedEvent.data.buyer.email,
        p_status: mappedStatus,
        p_mentor_slugs: mentorSlugs,
        p_expires_at: expiresAt,
        p_payload: approvedEvent
      });

    if (error) {
      console.error('❌ Erro na função transacional:', error);
      return;
    }

    console.log('✅ Resultado:', data);

    // Testar validação de acesso
    console.log('\n🔍 Testando validação de acesso...');
    
    const { data: accessData, error: accessError } = await supabase
      .from('mentor_access')
      .select(`
        *,
        customers!inner(email)
      `)
      .eq('customers.email', approvedEvent.data.buyer.email.toLowerCase())
      .eq('mentor_slug', 'java')
      .single();

    if (accessError) {
      console.error('❌ Erro ao buscar acesso:', accessError);
      return;
    }

    console.log('✅ Acesso encontrado:', {
      allowed: accessData.allowed,
      mentor: accessData.mentor_slug,
      expires_at: accessData.expires_at,
      source: accessData.source
    });

  } catch (error) {
    console.error('❌ Erro no teste:', error);
  }
}

// Executar teste
testProcessHotmartEvent();