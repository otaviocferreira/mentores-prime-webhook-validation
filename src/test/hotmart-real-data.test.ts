// Teste com dados reais da Hotmart fornecidos pelo usuário

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

const chargebackEvent = {
  "id": "da031c50-c6d4-4146-b7bf-fe71e2c2e412",
  "creation_date": 1769198874176,
  "event": "PURCHASE_PROTEST",
  "version": "2.0.0",
  "data": {
    ...approvedEvent.data,
    "purchase": {
      ...approvedEvent.data.purchase,
      "status": "DISPUTE"
    }
  }
};

console.log('📋 Testando mapeamento de dados da Hotmart:');
console.log('');

// Testar extração de campos essenciais
function extractEssentialFields(event: any) {
  return {
    event_id: event.id,
    event_type: event.event,
    buyer_email: event.data.buyer.email,
    buyer_name: event.data.buyer.name,
    buyer_document: event.data.buyer.document,
    buyer_document_type: event.data.buyer.document_type,
    product_id: event.data.product.id,
    product_name: event.data.product.name,
    product_ucode: event.data.product.ucode,
    transaction_id: event.data.purchase.transaction,
    purchase_status: event.data.purchase.status,
    subscription_id: event.data.subscription?.subscriber?.code ? parseInt(event.data.subscription.subscriber.code) : null,
    subscription_plan_name: event.data.subscription?.plan?.name || null,
    plan_id: event.data.subscription?.plan?.id || null,
    offer_code: event.data.purchase.offer?.code || null,
    creation_date: new Date(event.creation_date).toISOString()
  };
}

const approvedFields = extractEssentialFields(approvedEvent);
const chargebackFields = extractEssentialFields(chargebackEvent);

console.log('✅ Evento Aprovado:');
console.log(JSON.stringify(approvedFields, null, 2));
console.log('');

console.log('❌ Evento Chargeback:');
console.log(JSON.stringify(chargebackFields, null, 2));
console.log('');

// Testar mapeamento de status
function mapHotmartStatus(eventType: string, purchaseStatus: string): string {
  if (eventType === 'PURCHASE_APPROVED' && purchaseStatus === 'APPROVED') return 'ACTIVE';
  if (eventType === 'PURCHASE_PROTEST' && purchaseStatus === 'DISPUTE') return 'CHARGEBACK';
  if (eventType === 'PURCHASE_REFUNDED' && purchaseStatus === 'REFUNDED') return 'REFUNDED';
  if (eventType === 'PURCHASE_CANCELED' && purchaseStatus === 'CANCELED') return 'CANCELED';
  return 'PENDING';
}

console.log('🔄 Mapeamento de Status:');
console.log(`PURCHASE_APPROVED + APPROVED → ${mapHotmartStatus('PURCHASE_APPROVED', 'APPROVED')}`);
console.log(`PURCHASE_PROTEST + DISPUTE → ${mapHotmartStatus('PURCHASE_PROTEST', 'DISPUTE')}`);

console.log('');
console.log('✅ Teste de mapeamento concluído com sucesso!');