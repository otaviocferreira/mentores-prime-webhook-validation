// Teste completo do novo modelo com dados reais da Hotmart
import { supabase } from '../config/supabase';

// Dados reais da Hotmart fornecidos anteriormente
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

// Função de mapeamento de status (igual ao do webhook)
function mapHotmartStatus(eventType: string, purchaseStatus: string): string {
  if (eventType === 'PURCHASE_APPROVED' && purchaseStatus === 'APPROVED') return 'ACTIVE';
  if (eventType === 'PURCHASE_CANCELED' || purchaseStatus === 'CANCELED') return 'CANCELED';
  if (eventType === 'PURCHASE_REFUNDED' || purchaseStatus === 'REFUNDED') return 'REFUNDED';
  if (eventType === 'PURCHASE_PROTEST' || purchaseStatus === 'DISPUTE') return 'CHARGEBACK';
  if (eventType === 'SUBSCRIPTION_EXPIRED') return 'PAST_DUE';
  if (eventType === 'SUBSCRIPTION_SUSPENDED') return 'SUSPENDED';
  if (eventType === 'SUBSCRIPTION_TRIAL') return 'TRIAL';
  return 'UNKNOWN';
}

async function testNewModel() {
  console.log('🧪 Testando novo modelo de dados com Hotmart real...\n');
  
  try {
    const idempotencyKey = `test-new-model-${Date.now()}`;
    const mappedStatus = mapHotmartStatus(approvedEvent.event, approvedEvent.data.purchase.status);
    const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
    const hotmartProductId = BigInt(approvedEvent.data.product.id);
    const ucode = approvedEvent.data.product.ucode;
    const hotmartReference = approvedEvent.data.purchase.transaction;

    console.log('📋 Dados do evento:');
    console.log('- Idempotency Key:', idempotencyKey);
    console.log('- Event Type:', approvedEvent.event);
    console.log('- Hotmart Reference:', hotmartReference);
    console.log('- Buyer Email:', approvedEvent.data.buyer.email);
    console.log('- Hotmart Product ID:', hotmartProductId);
    console.log('- UCODE:', ucode);
    console.log('- Status:', mappedStatus);
    console.log('- Expires At:', expiresAt);
    console.log('');

    // 1. Processar evento com a nova função v2
    console.log('🔥 Processando evento com process_hotmart_event_v2...');
    const { data: processResult, error: processError } = await supabase
      .rpc('process_hotmart_event_v2', {
        p_idempotency_key: idempotencyKey,
        p_event_type: approvedEvent.event,
        p_hotmart_reference: hotmartReference,
        p_buyer_email: approvedEvent.data.buyer.email,
        p_hotmart_product_id: hotmartProductId,
        p_ucode: ucode,
        p_status: mappedStatus,
        p_expires_at: expiresAt,
        p_payload: approvedEvent
      });

    if (processError) {
      console.error('❌ Erro ao processar evento:', processError);
      return;
    }

    console.log('✅ Evento processado:', JSON.stringify(processResult, null, 2));
    console.log('');

    // 2. Verificar se o customer foi criado
    console.log('👤 Verificando customer...');
    const { data: customer } = await supabase
      .from('customers')
      .select('*')
      .eq('email', approvedEvent.data.buyer.email.toLowerCase())
      .single();

    if (customer) {
      console.log('✅ Customer encontrado:', JSON.stringify(customer, null, 2));
    } else {
      console.log('❌ Customer não encontrado');
    }
    console.log('');

    // 3. Verificar se o produto foi criado
    console.log('📦 Verificando hotmart_products...');
    const { data: product } = await supabase
      .from('hotmart_products')
      .select('*')
      .eq('hotmart_product_id', hotmartProductId)
      .single();

    if (product) {
      console.log('✅ Produto encontrado:', JSON.stringify(product, null, 2));
    } else {
      console.log('❌ Produto não encontrado');
    }
    console.log('');

    // 4. Verificar se customer_products foi criado
    console.log('🔗 Verificando customer_products...');
    const { data: customerProduct } = await supabase
      .from('customer_products')
      .select('*')
      .eq('customer_id', customer?.id)
      .eq('hotmart_product_id', hotmartProductId)
      .single();

    if (customerProduct) {
      console.log('✅ CustomerProduct encontrado:', JSON.stringify(customerProduct, null, 2));
    } else {
      console.log('❌ CustomerProduct não encontrado');
    }
    console.log('');

    // 5. Testar validação de acesso para mentores
    console.log('🔍 Testando validação de acesso para mentores...');
    
    // Primeiro, precisamos adicionar alguns mentores ao product_mentor_map
    console.log('📋 Adicionando mapeamentos de mentores para o produto...');
    
    const mentorSlugs = ['java', 'python', 'react', 'nodejs'];
    
    for (const mentorSlug of mentorSlugs) {
      const { error: mapError } = await supabase
        .from('product_mentor_map')
        .upsert({
          hotmart_product_id: hotmartProductId,
          mentor_slug: mentorSlug
        }, {
          onConflict: 'hotmart_product_id,mentor_slug'
        });

      if (mapError) {
        console.error(`❌ Erro ao adicionar mentor ${mentorSlug}:`, mapError);
      } else {
        console.log(`✅ Mentor ${mentorSlug} adicionado ao produto`);
      }
    }
    console.log('');

    // Agora testar a validação de acesso
    for (const mentorSlug of mentorSlugs) {
      console.log(`🧪 Testando acesso ao mentor: ${mentorSlug}`);
      
      const { data: accessData, error: accessError } = await supabase
        .rpc('check_mentor_access_v2', {
          p_customer_id: customer?.id,
          p_mentor_slug: mentorSlug
        });

      if (accessError) {
        console.error(`❌ Erro ao verificar acesso:`, accessError);
      } else {
        console.log(`✅ Resultado:`, JSON.stringify(accessData, null, 2));
      }
      console.log('');
    }

    // 6. Testar um mentor que não existe
    console.log('🧪 Testando acesso a mentor não mapeado (deve ser negado)...');
    const { data: noAccessData } = await supabase
      .rpc('check_mentor_access_v2', {
        p_customer_id: customer?.id,
        p_mentor_slug: 'mentor-inexistente'
      });

    console.log('✅ Resultado para mentor inexistente:', JSON.stringify(noAccessData, null, 2));
    console.log('');

    console.log('🎉 Teste do novo modelo concluído!');

  } catch (error) {
    console.error('❌ Erro no teste:', error);
  }
}

// Executar teste
testNewModel();