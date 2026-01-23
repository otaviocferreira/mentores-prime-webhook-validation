import crypto from 'crypto';

// Teste da estratégia de validação e idempotência do webhook

interface TestEvent {
  id?: string;
  event: string;
  data: {
    purchase?: {
      transaction?: string;
      status?: string;
    };
    subscription?: {
      subscriber?: {
        code?: string;
      };
      plan?: {
        name?: string;
      };
    };
    buyer: {
      email: string;
    };
    product: {
      name: string;
    };
  };
}

// Função para gerar idempotency key conforme a nova estratégia
function generateIdempotencyKey(event: TestEvent, rawBody: string): string {
  // Preferência 1: usar event.id se disponível
  if (event.id) {
    return event.id;
  }
  
  // Preferência 2: sha256(eventType + reference + rawBody)
  const eventType = event.event;
  const reference = event.data.purchase?.transaction || event.data.subscription?.subscriber?.code || '';
  const idempotencyData = `${eventType}-${reference}-${rawBody}`;
  
  return crypto.createHash('sha256').update(idempotencyData).digest('hex');
}

// Função para validar token (simulando a função real)
function validateHotmartToken(token: string): boolean {
  const expectedToken = process.env.HOTMART_WEBHOOK_TOKEN || 'test-token-123';
  return token === expectedToken;
}

// Testes
console.log('=== Testes de Validação e Idempotência do Webhook ===\n');

// Teste 1: Evento com ID (deve usar o ID como chave)
const eventWithId: TestEvent = {
  id: 'hotmart-event-123',
  event: 'PURCHASE_APPROVED',
  data: {
    purchase: { transaction: 'TX123', status: 'APPROVED' },
    buyer: { email: 'test@example.com' },
    product: { name: 'Curso Java' }
  }
};

const rawBody1 = JSON.stringify(eventWithId);
const idempotencyKey1 = generateIdempotencyKey(eventWithId, rawBody1);
console.log('Teste 1 - Evento com ID:');
console.log(`Event ID: ${eventWithId.id}`);
console.log(`Idempotency Key: ${idempotencyKey1}`);
console.log(`Should equal event.id: ${idempotencyKey1 === eventWithId.id}\n`);

// Teste 2: Evento sem ID (deve gerar SHA256)
const eventWithoutId: TestEvent = {
  event: 'PURCHASE_APPROVED',
  data: {
    purchase: { transaction: 'TX456', status: 'APPROVED' },
    buyer: { email: 'test2@example.com' },
    product: { name: 'Curso Python' }
  }
};

const rawBody2 = JSON.stringify(eventWithoutId);
const idempotencyKey2 = generateIdempotencyKey(eventWithoutId, rawBody2);
console.log('Teste 2 - Evento sem ID:');
console.log(`Event: ${eventWithoutId.event}`);
console.log(`Reference: ${eventWithoutId.data.purchase?.transaction}`);
console.log(`Idempotency Key: ${idempotencyKey2}`);
console.log(`Should be SHA256: ${idempotencyKey2.length === 64}\n`);

// Teste 3: Evento de subscription (deve usar subscriber.code como reference)
const subscriptionEvent: TestEvent = {
  event: 'SUBSCRIPTION_ACTIVATED',
  data: {
    subscription: { 
      subscriber: { code: 'SUB789' },
      plan: { name: 'Plano Mensal' }
    },
    buyer: { email: 'subscriber@example.com' },
    product: { name: 'Assinatura Mentoria' }
  }
};

const rawBody3 = JSON.stringify(subscriptionEvent);
const idempotencyKey3 = generateIdempotencyKey(subscriptionEvent, rawBody3);
console.log('Teste 3 - Evento de Subscription:');
console.log(`Event: ${subscriptionEvent.event}`);
console.log(`Reference: ${subscriptionEvent.data.subscription?.subscriber?.code}`);
console.log(`Idempotency Key: ${idempotencyKey3}`);
console.log(`Should be SHA256: ${idempotencyKey3.length === 64}\n`);

// Teste 4: Validação de token
console.log('Teste 4 - Validação de Token:');
const validToken = 'test-token-123';
const invalidToken = 'wrong-token';
console.log(`Valid token (${validToken}): ${validateHotmartToken(validToken)}`);
console.log(`Invalid token (${invalidToken}): ${validateHotmartToken(invalidToken)}\n`);

// Teste 5: Idempotência - mesmo evento deve gerar mesma chave
const sameEvent = { ...eventWithoutId };
const rawBody5 = JSON.stringify(sameEvent);
const idempotencyKey5 = generateIdempotencyKey(sameEvent, rawBody5);
console.log('Teste 5 - Idempotência:');
console.log(`First key: ${idempotencyKey2}`);
console.log(`Second key: ${idempotencyKey5}`);
console.log(`Should be equal: ${idempotencyKey2 === idempotencyKey5}\n`);

// Teste 6: Eventos diferentes devem gerar chaves diferentes
const differentEvent: TestEvent = {
  event: 'PURCHASE_CANCELED',
  data: {
    purchase: { transaction: 'TX456', status: 'CANCELED' },
    buyer: { email: 'test2@example.com' },
    product: { name: 'Curso Python' }
  }
};

const rawBody6 = JSON.stringify(differentEvent);
const idempotencyKey6 = generateIdempotencyKey(differentEvent, rawBody6);
console.log('Teste 6 - Eventos diferentes:');
console.log(`First event key: ${idempotencyKey2}`);
console.log(`Different event key: ${idempotencyKey6}`);
console.log(`Should be different: ${idempotencyKey2 !== idempotencyKey6}\n`);

console.log('=== Testes concluídos ===');