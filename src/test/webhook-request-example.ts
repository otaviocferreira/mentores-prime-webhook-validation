// Exemplo de requisição de webhook da Hotmart com headers
// IMPORTANTE: A validação usa o header X-HOTMART-HOTTOK para autenticação
// A idempotência é garantida através de:
// 1. event.id (se disponível) ou 
// 2. sha256(eventType + reference + rawBody)

export const webhookExample = {
  headers: {
    'X-HOTMART-HOTTOK': 'seu-token-aqui', // Token configurado em HOTMART_WEBHOOK_TOKEN
    'Content-Type': 'application/json',
    'User-Agent': 'Hotmart-Webhook/2.0'
  },
  body: {
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
  }
};

// Exemplo de requisição com cURL
export const curlExample = `curl -X POST http://localhost:3000/webhooks/hotmart \\
  -H "X-HOTMART-HOTTOK: seu-token-aqui" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(webhookExample.body, null, 2)}'`;

console.log('📤 Exemplo de requisição cURL para testar o webhook:');
console.log(curlExample);
console.log('');

// Exemplos de respostas esperadas
export const successResponse = {
  message: 'Event processed successfully',
  idempotency_key: '37c93564-229d-4177-8907-5ff33855426d',
  result: {
    customer_id: 'uuid-do-cliente',
    subscription_id: 'uuid-da-assinatura',
    mentor_access_granted: ['java', 'python'],
    status: 'ACTIVE'
  }
};

export const duplicateResponse = {
  message: 'Event already processed',
  idempotency_key: '37c93564-229d-4177-8907-5ff33855426d',
  duplicate: true,
  status: 'PROCESSED'
};

export const invalidTokenResponse = {
  error: 'Invalid authentication token'
};

console.log('✅ Respostas esperadas:');
console.log('Sucesso:', JSON.stringify(successResponse, null, 2));
console.log('');
console.log('🔄 Duplicado:', JSON.stringify(duplicateResponse, null, 2));
console.log('');
console.log('❌ Token inválido:', JSON.stringify(invalidTokenResponse, null, 2));
console.log('');

// Exemplo de requisição para validação de acesso
export const accessValidationExample = `curl -X GET "http://localhost:3000/access/validate?email=testeComprador271101postman15@example.com&mentor=java" \\
  -H "X-API-KEY: sua-api-key-aqui"`;

console.log('🔍 Exemplo de requisição para validação de acesso:');
console.log(accessValidationExample);
console.log('');

console.log('✅ Exemplos criados com base nos dados reais da Hotmart!');
console.log('');
console.log('🎯 Estratégia de Negócio:');
console.log('   - Um produto na Hotmart libera acesso a TODOS os mentores');
console.log('   - GPT valida acesso por email + mentor_slug');
console.log('   - Compra aprovada = acesso a java, python, react, node, etc.');
console.log('   - Futuro: trilhas específicas com mentores selecionados');