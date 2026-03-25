import test from 'node:test';
import assert from 'node:assert/strict';
import { validateAccess } from '../services/access.service';

test('validateAccess normaliza email com espacos e caixa alta', async () => {
  let receivedEmail = '';

  const response = await validateAccess(
    { email: '  Aluno@Example.COM  ', mentor: 'java' },
    {
      async findCustomerByEmail(email) {
        receivedEmail = email;
        return { id: 'customer-1' };
      },
      async listActiveCustomerProducts() {
        return [{ hotmart_product_id: 101, expires_at: '2026-04-24T00:00:00.000Z' }];
      },
      async listMentorMappings() {
        return [{ hotmart_product_id: 101 }];
      }
    },
    new Date('2026-03-24T12:00:00.000Z')
  );

  assert.equal(receivedEmail, 'aluno@example.com');
  assert.equal(response.allowed, true);
  assert.equal(response.expires_at, '2026-04-24T00:00:00.000Z');
});

test('validateAccess nega quando o produto ativo expirou', async () => {
  const response = await validateAccess(
    { email: 'aluno@example.com', mentor: 'java' },
    {
      async findCustomerByEmail() {
        return { id: 'customer-1' };
      },
      async listActiveCustomerProducts() {
        return [{ hotmart_product_id: 101, expires_at: '2026-03-20T00:00:00.000Z' }];
      },
      async listMentorMappings() {
        return [{ hotmart_product_id: 101 }];
      }
    },
    new Date('2026-03-24T12:00:00.000Z')
  );

  assert.deepEqual(response, {
    allowed: false,
    mentor: 'java',
    expires_at: null,
    source: 'product',
    plan: null,
    products: []
  });
});

test('validateAccess retorna expiracao maxima entre produtos permitidos', async () => {
  const response = await validateAccess(
    { email: 'aluno@example.com', mentor: 'java' },
    {
      async findCustomerByEmail() {
        return { id: 'customer-1' };
      },
      async listActiveCustomerProducts() {
        return [
          { hotmart_product_id: 101, expires_at: '2026-04-24T00:00:00.000Z' },
          { hotmart_product_id: 102, expires_at: '2026-06-24T00:00:00.000Z' },
          { hotmart_product_id: 103, expires_at: '2026-05-24T00:00:00.000Z' }
        ];
      },
      async listMentorMappings(productIds) {
        assert.deepEqual(productIds, [101, 102, 103]);
        return [{ hotmart_product_id: 101 }, { hotmart_product_id: 102 }];
      }
    },
    new Date('2026-03-24T12:00:00.000Z')
  );

  assert.equal(response.allowed, true);
  assert.equal(response.expires_at, '2026-06-24T00:00:00.000Z');
  assert.deepEqual(response.products, [101, 102]);
});

test('validateAccess preserva acesso vitalicio quando existe produto sem expiracao', async () => {
  const response = await validateAccess(
    { email: 'aluno@example.com', mentor: 'java' },
    {
      async findCustomerByEmail() {
        return { id: 'customer-1' };
      },
      async listActiveCustomerProducts() {
        return [
          { hotmart_product_id: 101, expires_at: null },
          { hotmart_product_id: 102, expires_at: '2026-06-24T00:00:00.000Z' }
        ];
      },
      async listMentorMappings() {
        return [{ hotmart_product_id: 101 }, { hotmart_product_id: 102 }];
      }
    }
  );

  assert.equal(response.allowed, true);
  assert.equal(response.expires_at, null);
});
