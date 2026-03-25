import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateExpirationDate,
  extractBuyerEmail,
  generateWebhookIdempotencyKey,
  mapHotmartStatus,
  processHotmartEvent,
  toIsoTimestamp
} from '../services/webhook.service';
import { HotmartEvent } from '../types';

function buildApprovedEvent(overrides: Partial<HotmartEvent> = {}): HotmartEvent {
  return {
    id: 'evt-1',
    event: 'PURCHASE_APPROVED',
    version: '2.0.0',
    creation_date: Date.parse('2026-03-24T10:00:00.000Z'),
    data: {
      buyer: {
        email: 'Aluno@Example.com ',
        name: 'Aluno',
        document: '123',
        document_type: 'CPF'
      },
      product: {
        id: 777,
        name: 'Mentoria Prime',
        ucode: 'product-777'
      },
      purchase: {
        transaction: 'HP123',
        status: 'APPROVED',
        price: {
          value: 100,
          currency_value: 'BRL'
        },
        payment: {
          type: 'CREDIT_CARD',
          installments_number: 1
        },
        approved_date: Date.parse('2026-03-24T10:00:00.000Z'),
        order_date: Date.parse('2026-03-24T09:00:00.000Z')
      },
      subscription: {
        status: 'ACTIVE',
        plan: {
          id: 55,
          name: 'Prime Mensal'
        },
        subscriber: {
          code: 'SUB-1'
        }
      }
    },
    ...overrides
  };
}

test('extractBuyerEmail normaliza email do buyer principal', () => {
  const email = extractBuyerEmail(buildApprovedEvent());
  assert.equal(email, 'aluno@example.com');
});

test('extractBuyerEmail usa fallback de subscription subscriber quando buyer.email nao vem', () => {
  const event = buildApprovedEvent();
  (event.data.buyer as unknown as Record<string, unknown>).email = undefined;
  (event.data.subscription!.subscriber as unknown as Record<string, unknown>).email = ' Assinante@Example.com ';

  const email = extractBuyerEmail(event);
  assert.equal(email, 'assinante@example.com');
});

test('generateWebhookIdempotencyKey usa event.id quando presente', () => {
  const event = buildApprovedEvent();
  const key = generateWebhookIdempotencyKey(event, JSON.stringify(event));
  assert.equal(key, 'evt-1');
});

test('generateWebhookIdempotencyKey gera hash estavel sem event.id', () => {
  const event = buildApprovedEvent({ id: '' });
  const rawBody = JSON.stringify(event);

  const key = generateWebhookIdempotencyKey(event, rawBody);

  assert.equal(key.length, 64);
  assert.equal(key, generateWebhookIdempotencyKey(event, rawBody));
});

test('toIsoTimestamp aceita segundos, milissegundos e ISO string', () => {
  assert.equal(toIsoTimestamp(1711243200), '2024-03-24T01:20:00.000Z');
  assert.equal(toIsoTimestamp(1711243200000), '2024-03-24T01:20:00.000Z');
  assert.equal(toIsoTimestamp('2026-04-24T00:00:00Z'), '2026-04-24T00:00:00.000Z');
});

test('calculateExpirationDate usa next_charge_date quando enviado', () => {
  const event = buildApprovedEvent();
  event.data.subscription!.next_charge_date = Date.parse('2026-04-24T00:00:00.000Z');

  const expiresAt = calculateExpirationDate(event, 'ACTIVE', new Date('2026-03-24T12:00:00.000Z'));
  assert.equal(expiresAt, '2026-04-24T00:00:00.000Z');
});

test('calculateExpirationDate usa purchase.date_next_charge quando a Hotmart envia nesse campo', () => {
  const event = buildApprovedEvent({ event: 'PURCHASE_COMPLETE' });
  event.data.purchase.status = 'COMPLETED';
  event.data.purchase.date_next_charge = Date.parse('2026-04-11T12:00:00.000Z');

  const expiresAt = calculateExpirationDate(event, 'ACTIVE', new Date('2026-03-24T12:00:00.000Z'));
  assert.equal(expiresAt, '2026-04-11T12:00:00.000Z');
});

test('calculateExpirationDate para assinatura mensal sem next_charge_date cai para proximo mes', () => {
  const event = buildApprovedEvent();

  const expiresAt = calculateExpirationDate(event, 'ACTIVE', new Date('2026-03-24T12:00:00.000Z'));
  assert.equal(expiresAt, '2026-04-24T10:00:00.000Z');
});

test('calculateExpirationDate para compra nao recorrente cai para um ano', () => {
  const event = buildApprovedEvent();
  event.data.subscription = undefined;

  const expiresAt = calculateExpirationDate(event, 'ACTIVE', new Date('2026-03-24T12:00:00.000Z'));
  assert.equal(expiresAt, '2027-03-24T12:00:00.000Z');
});

test('mapHotmartStatus cobre eventos principais', () => {
  assert.equal(mapHotmartStatus('PURCHASE_APPROVED', 'APPROVED'), 'ACTIVE');
  assert.equal(mapHotmartStatus('PURCHASE_COMPLETE', 'COMPLETED'), 'ACTIVE');
  assert.equal(mapHotmartStatus('PURCHASE_COMPLETED', 'COMPLETED'), 'ACTIVE');
  assert.equal(mapHotmartStatus('PURCHASE_CANCELED', 'APPROVED'), 'CANCELED');
  assert.equal(mapHotmartStatus('PURCHASE_REFUNDED', 'APPROVED'), 'REFUNDED');
  assert.equal(mapHotmartStatus('PURCHASE_PROTEST', 'DISPUTE'), 'CHARGEBACK');
  assert.equal(mapHotmartStatus('SUBSCRIPTION_EXPIRED', 'APPROVED'), 'PAST_DUE');
  assert.equal(mapHotmartStatus('SUBSCRIPTION_SUSPENDED', 'APPROVED'), 'SUSPENDED');
  assert.equal(mapHotmartStatus('SUBSCRIPTION_TRIAL', 'APPROVED'), 'TRIAL');
  assert.equal(mapHotmartStatus('UNMAPPED', 'WAITING'), 'UNKNOWN');
});

test('processHotmartEvent usa email normalizado e expira assinatura no mes seguinte', async () => {
  const event = buildApprovedEvent();
  const calls: Record<string, unknown>[] = [];

  const result = await processHotmartEvent(
    event,
    'evt-1',
    {
      async upsertCustomer(email) {
        calls.push({ op: 'upsertCustomer', email });
      },
      async findCustomerByEmail(email) {
        calls.push({ op: 'findCustomerByEmail', email });
        return { id: 'customer-1' };
      },
      async upsertProduct(input) {
        calls.push({ op: 'upsertProduct', input });
      },
      async findCustomerProduct() {
        return null;
      },
      async updateCustomerProduct() {
        throw new Error('nao deveria atualizar neste cenario');
      },
      async insertCustomerProduct(input) {
        calls.push({ op: 'insertCustomerProduct', input });
      },
      async insertLedger(input) {
        calls.push({ op: 'insertLedger', input });
      }
    },
    new Date('2026-03-24T12:00:00.000Z')
  );

  const upsertCustomerCall = calls.find((call) => call.op === 'upsertCustomer') as Record<string, unknown>;
  const insertCustomerProductCall = calls.find((call) => call.op === 'insertCustomerProduct') as Record<string, any>;
  const insertLedgerCall = calls.find((call) => call.op === 'insertLedger') as Record<string, any>;

  assert.equal(upsertCustomerCall.email, 'aluno@example.com');
  assert.equal(insertCustomerProductCall.input.expires_at, '2026-04-24T10:00:00.000Z');
  assert.equal(insertLedgerCall.input.buyer_email, 'aluno@example.com');
  assert.equal(result.expires_at, '2026-04-24T10:00:00.000Z');
});

test('processHotmartEvent trata PURCHASE_COMPLETE como acesso ativo e usa date_next_charge do purchase', async () => {
  const event = buildApprovedEvent({ event: 'PURCHASE_COMPLETE' });
  event.data.purchase.status = 'COMPLETED';
  event.data.purchase.date_next_charge = Date.parse('2026-04-11T12:00:00.000Z');

  let insertedCustomerProduct: any = null;
  let insertedLedger: any = null;

  const result = await processHotmartEvent(
    event,
    'evt-complete',
    {
      async upsertCustomer() {},
      async findCustomerByEmail() {
        return { id: 'customer-1' };
      },
      async upsertProduct() {},
      async findCustomerProduct() {
        return null;
      },
      async updateCustomerProduct() {},
      async insertCustomerProduct(input) {
        insertedCustomerProduct = input;
      },
      async insertLedger(input) {
        insertedLedger = input;
      }
    },
    new Date('2026-03-24T12:00:00.000Z')
  );

  assert.equal(insertedCustomerProduct?.status, 'ACTIVE');
  assert.equal(insertedCustomerProduct?.expires_at, '2026-04-11T12:00:00.000Z');
  assert.equal(insertedLedger?.next_charge_date, '2026-04-11T12:00:00.000Z');
  assert.equal(result.mapped_status, 'ACTIVE');
  assert.equal(result.expires_at, '2026-04-11T12:00:00.000Z');
});

test('processHotmartEvent preserva expiracao anterior ao receber cancelamento', async () => {
  const event = buildApprovedEvent({ event: 'PURCHASE_CANCELED' });
  event.data.purchase.status = 'CANCELED';

  let updatedPayload: any = null;

  await processHotmartEvent(
    event,
    'evt-2',
    {
      async upsertCustomer() {},
      async findCustomerByEmail() {
        return { id: 'customer-1' };
      },
      async upsertProduct() {},
      async findCustomerProduct() {
        return { id: 'cp-1', expires_at: '2026-04-24T10:00:00.000Z' };
      },
      async updateCustomerProduct(_id, input) {
        updatedPayload = input as unknown as Record<string, unknown>;
      },
      async insertCustomerProduct() {
        throw new Error('nao deveria inserir neste cenario');
      },
      async insertLedger() {}
    },
    new Date('2026-03-24T12:00:00.000Z')
  );

  assert.equal(updatedPayload?.status, 'CANCELED');
  assert.equal(updatedPayload?.expires_at, '2026-04-24T10:00:00.000Z');
});

test('processHotmartEvent rejeita payload sem email reaproveitavel', async () => {
  const event = buildApprovedEvent();
  (event.data.buyer as unknown as Record<string, unknown>).email = undefined;
  event.data.subscription = undefined;

  await assert.rejects(
    () =>
      processHotmartEvent(
        event,
        'evt-3',
        {
          async upsertCustomer() {},
          async findCustomerByEmail() {
            return { id: 'customer-1' };
          },
          async upsertProduct() {},
          async findCustomerProduct() {
            return null;
          },
          async updateCustomerProduct() {},
          async insertCustomerProduct() {},
          async insertLedger() {}
        }
      ),
    /buyer email/
  );
});
