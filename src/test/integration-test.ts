// Teste completo da integração com a nova estrutura SQL do usuário
import { supabase } from '../config/supabase';

// Dados reais da Hotmart fornecidos pelo usuário
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
      "is_physical_product": false,
      "content": {
        "has_physical_products": true,
        "products": [
          {
            "id": 4774438,
            "ucode": "559fef42-3406-4d82-b775-d09bd33936b1",
            "name": "How to Make Clear Ice",
            "is_physical_product": false
          },
          {
            "id": 4999597,
            "ucode": "099e7644-b7d1-43d6-82a9-ec6be0118a4b",
            "name": "Organizador de Poeira",
            "is_physical_product": true
          }
        ]
      }
    },
    "affiliates": [
      {
        "affiliate_code": "Q58388177J",
        "name": "Affiliate name"
      }
    ],
    "buyer": {
      "email": "testeComprador271101postman15@example.com",
      "name": "Teste Comprador",
      "first_name": "Teste",
      "last_name": "Comprador",
      "checkout_phone_code": "999999999",
      "checkout_phone": "99999999900",
      "address": {
        "city": "Uberlândia",
        "country": "Brasil",
        "country_iso": "BR",
        "state": "Minas Gerais",
        "neighborhood": "Tubalina",
        "zipcode": "38400123",
        "address": "Avenida Francisco Galassi",
        "number": "10",
        "complement": "Perto do shopping"
      },
      "document": "69526128664",
      "document_type": "CPF"
    },
    "producer": {
      "name": "Producer Test Name",
      "document": "12345678965",
      "legal_nature": "Pessoa Física"
    },
    "commissions": [
      {
        "value": 149.5,
        "source": "MARKETPLACE",
        "currency_value": "BRL"
      },
      {
        "value": 1350.5,
        "source": "PRODUCER",
        "currency_value": "BRL"
      }
    ],
    "purchase": {
      "approved_date": 1511783346000,
      "full_price": {
        "value": 1500,
        "currency_value": "BRL"
      },
      "price": {
        "value": 1500,
        "currency_value": "BRL"
      },
      "checkout_country": {
        "name": "Brasil",
        "iso": "BR"
      },
      "order_bump": {
        "is_order_bump": true,
        "parent_purchase_transaction": "HP02316330308193"
      },
      "event_tickets": {
        "amount": 1769198874087
      },
      "original_offer_price": {
        "value": 1500,
        "currency_value": "BRL"
      },
      "order_date": 1511783344000,
      "status": "APPROVED",
      "transaction": "HP16015479281022",
      "payment": {
        "installments_number": 12,
        "type": "CREDIT_CARD"
      },
      "offer": {
        "code": "test",
        "coupon_code": "SHHUHA"
      },
      "sckPaymentLink": "sckPaymentLinkTest",
      "is_funnel": false,
      "business_model": "I"
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

// Função auxiliar para mapear status
function mapHotmartStatus(eventType: string, purchaseStatus: string): string {
  if (eventType === 'PURCHASE_APPROVED' && purchaseStatus === 'APPROVED') return 'ACTIVE';
  if (eventType === 'PURCHASE_CANCELED' || purchaseStatus === 'CANCELED') return 'CANCELED';
  if (eventType === 'PURCHASE_REFUNDED' || purchaseStatus === 'REFUNDED') return 'REFUNDED';
  if (eventType === 'PURCHASE_PROTEST' && purchaseStatus === 'DISPUTE') return 'CHARGEBACK';
  if (eventType === 'SUBSCRIPTION_EXPIRED') return 'EXPIRED';
  return 'CANCELED';
}

// Função auxiliar para determinar mentor slugs
function determineMentorSlugs(event: any): string[] {
  const slugs: string[] = [];
  
  // Lógica simples: extrair do nome do produto/plano
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
  if (productName.includes('javascript') || planName.includes('javascript')) {
    slugs.push('javascript');
  }
  
  // Se não encontrou nenhum mentor específico, adiciona um padrão
  if (slugs.length === 0) {
    slugs.push('default');
  }
  
  return slugs;
}

// Testar a função process_hotmart_event
async function testProcessHotmartEvent() {
  console.log('🧪 Testando função process_hotmart_event com dados reais...\n');
  
  try {
    const idempotencyKey = `test-${Date.now()}`;
    const mappedStatus = mapHotmartStatus(approvedEvent.event, approvedEvent.data.purchase.status);
    const mentorSlugs = determineMentorSlugs(approvedEvent);
    const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
    
    console.log('📋 Parâmetros da função:');
    console.log('- Idempotency Key:', idempotencyKey);
    console.log('- Event Type:', approvedEvent.event);
    console.log('- Hotmart Reference:', approvedEvent.data.purchase.transaction);
    console.log('- Buyer Email:', approvedEvent.data.buyer.email);
    console.log('- Status:', mappedStatus);
    console.log('- Mentor Slugs:', mentorSlugs);
    console.log('- Expires At:', expiresAt);
    console.log('');
    
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
      console.error('❌ Erro na função:', error);
      return;
    }
    
    console.log('✅ Resultado da função:', JSON.stringify(data, null, 2));
    console.log('');
    
    // Testar validação de acesso
    console.log('🔍 Testando validação de acesso...');
    
    // Buscar customer
    const { data: customer } = await supabase
      .from('customers')
      .select('id')
      .eq('email', approvedEvent.data.buyer.email.toLowerCase())
      .single();
    
    if (customer) {
      // Buscar mentor_access
      const { data: access } = await supabase
        .from('mentor_access')
        .select('*')
        .eq('customer_id', customer.id)
        .eq('mentor_slug', mentorSlugs[0])
        .single();
      
      console.log('✅ Acesso encontrado:', JSON.stringify(access, null, 2));
      
      // Buscar subscription
      const { data: subscription } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('customer_id', customer.id)
        .single();
      
      console.log('✅ Subscription encontrada:', JSON.stringify(subscription, null, 2));
    }
    
  } catch (error) {
    console.error('❌ Erro no teste:', error);
  }
}

// Testar idempotência
async function testIdempotency() {
  console.log('\n🔄 Testando idempotência...\n');
  
  const idempotencyKey = `test-idempotency-${Date.now()}`;
  const mappedStatus = mapHotmartStatus(approvedEvent.event, approvedEvent.data.purchase.status);
  const mentorSlugs = determineMentorSlugs(approvedEvent);
  const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
  
  // Primeira chamada
  console.log('1️⃣ Primeira chamada...');
  const { data: result1 } = await supabase
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
  
  console.log('Resultado 1:', JSON.stringify(result1, null, 2));
  
  // Segunda chamada com mesma chave
  console.log('\n2️⃣ Segunda chamada com mesma chave...');
  const { data: result2 } = await supabase
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
  
  console.log('Resultado 2:', JSON.stringify(result2, null, 2));
  
  if (result2.duplicate) {
    console.log('✅ Idempotência funcionando corretamente!');
  } else {
    console.log('❌ Idempotência não funcionou!');
  }
}

// Executar testes
async function runTests() {
  console.log('🚀 Iniciando testes de integração com nova estrutura SQL\n');
  
  await testProcessHotmartEvent();
  await testIdempotency();
  
  console.log('\n✅ Testes concluídos!');
}

// Executar apenas se estiver rodando diretamente
if (require.main === module) {
  runTests().catch(console.error);
}

export { testProcessHotmartEvent, testIdempotency };