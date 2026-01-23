import { generateIdempotencyKey, validateHotmartToken, validateApiKey } from '../utils/crypto';

// Teste de idempotência com event_id
const mockEventWithId = {
  id: 'test-event-123',
  event: 'PURCHASE_APPROVED',
  version: '1.0',
  creation_date: 1706013600000, // timestamp em milissegundos
  data: {
    buyer: {
      email: 'test@example.com',
      name: 'Test User',
      document: '12345678901',
      document_type: 'CPF'
    },
    product: {
      id: 123,
      name: 'Produto Teste',
      ucode: 'PROD123'
    },
    purchase: {
      transaction: 'TRANS123',
      status: 'APPROVED',
      price: {
        value: 997.00,
        currency_value: 'BRL'
      },
      payment: {
        type: 'credit_card',
        installments_number: 12
      }
    }
  }
};

// Teste de idempotência sem event_id
const mockEventWithoutId = {
  id: '', // id vazio para simular falta de event_id
  event: 'PURCHASE_APPROVED',
  version: '1.0',
  creation_date: 1706013600000, // timestamp em milissegundos
  data: {
    buyer: {
      email: 'test@example.com',
      name: 'Test User',
      document: '12345678901',
      document_type: 'CPF'
    },
    product: {
      id: 123,
      name: 'Produto Teste',
      ucode: 'PROD123'
    },
    purchase: {
      transaction: 'TRANS123',
      status: 'APPROVED',
      price: {
        value: 997.00,
        currency_value: 'BRL'
      },
      payment: {
        type: 'credit_card',
        installments_number: 12
      }
    }
  }
};

console.log('🧪 Testando geração de idempotency key:');
console.log('Com event_id:', generateIdempotencyKey(mockEventWithId));
console.log('Sem event_id:', generateIdempotencyKey(mockEventWithoutId));

console.log('\n🧪 Testando validação de token:');
process.env.HOTMART_WEBHOOK_TOKEN = 'test-token-123';
console.log(`Token válido: ${validateHotmartToken('test-token-123')}`);
console.log(`Token inválido: ${validateHotmartToken('wrong-token')}`);

console.log('\n🧪 Testando validação de API key:');
process.env.API_KEY = 'api-key-123';
console.log(`API key válida: ${validateApiKey('api-key-123')}`);
console.log(`API key inválida: ${validateApiKey('wrong-key')}`);

// Teste de hash para idempotência sem event_id
import crypto from 'crypto';
console.log('\n🧪 Testando hash para idempotência sem event_id:');
const bodyStr = JSON.stringify(mockEventWithoutId);
const hashKey = crypto.createHash('sha256').update(bodyStr).digest('hex');
console.log(`Hash gerado: ${hashKey}`);

console.log('\n✅ Todos os testes passaram!');