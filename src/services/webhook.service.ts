import crypto from 'crypto';
import { HotmartEvent } from '../types';

export type MappedAccessStatus =
  | 'ACTIVE'
  | 'CANCELED'
  | 'REFUNDED'
  | 'CHARGEBACK'
  | 'PAST_DUE'
  | 'SUSPENDED'
  | 'TRIAL'
  | 'UNKNOWN';

export interface WebhookCustomerProduct {
  id: string;
  expires_at: string | null;
}

export interface ProductUpsertInput {
  hotmart_product_id: number;
  ucode: string;
  name: string;
  status: 'ACTIVE';
  is_subscription: boolean;
  active: boolean;
  updated_at: string;
}

export interface CustomerProductUpdateInput {
  hotmart_reference: string | null;
  status: MappedAccessStatus;
  expires_at: string | null;
  updated_at: string;
}

export interface CustomerProductInsertInput extends CustomerProductUpdateInput {
  customer_id: string;
  hotmart_product_id: number;
  created_at: string;
}

export interface LedgerInsertInput {
  idempotency_key: string;
  event_type: string;
  hotmart_reference: string | null;
  buyer_email: string;
  product_id: string;
  offer_code: string | null;
  plan_id: string | null;
  purchase_status: string | null;
  subscription_status: string | null;
  order_date: string | null;
  approved_date: string | null;
  next_charge_date: string | null;
  processing_status: 'PROCESSED';
  processed_at: string;
}

export interface WebhookProcessingDeps {
  upsertCustomer(email: string): Promise<void>;
  findCustomerByEmail(email: string): Promise<{ id: string } | null>;
  upsertProduct(input: ProductUpsertInput): Promise<void>;
  findCustomerProduct(customerId: string, productId: number): Promise<WebhookCustomerProduct | null>;
  updateCustomerProduct(id: string, input: CustomerProductUpdateInput): Promise<void>;
  insertCustomerProduct(input: CustomerProductInsertInput): Promise<void>;
  insertLedger(input: LedgerInsertInput): Promise<void>;
}

function readNestedValue(source: unknown, path: string[]): unknown {
  let current: unknown = source;
  for (const key of path) {
    if (typeof current !== 'object' || current === null || !(key in current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

export function normalizeEmail(email: string | null | undefined): string | null {
  if (typeof email !== 'string') return null;
  const normalized = email.trim().toLowerCase();
  return normalized || null;
}

export function extractBuyerEmail(event: HotmartEvent): string | null {
  const candidatePaths = [
    ['data', 'buyer', 'email'],
    ['data', 'purchase', 'buyer', 'email'],
    ['data', 'subscription', 'subscriber', 'email']
  ];

  for (const path of candidatePaths) {
    const value = readNestedValue(event, path);
    const normalized = normalizeEmail(typeof value === 'string' ? value : null);
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

function parseTimestamp(value: unknown): Date | null {
  if (value === null || value === undefined || value === '') return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const normalized = value < 1e12 ? value * 1000 : value;
    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;

    if (/^\d+$/.test(trimmed)) {
      return parseTimestamp(Number(trimmed));
    }

    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  return null;
}

export function toIsoTimestamp(value: unknown): string | null {
  const parsed = parseTimestamp(value);
  return parsed ? parsed.toISOString() : null;
}

function addMonths(baseDate: Date, months: number): Date {
  const result = new Date(baseDate.getTime());
  const targetDay = result.getUTCDate();

  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);

  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(targetDay, lastDay));

  return result;
}

export function mapHotmartStatus(
  eventType: string,
  purchaseStatus: string | null | undefined
): MappedAccessStatus {
  if (eventType === 'PURCHASE_APPROVED' && purchaseStatus === 'APPROVED') return 'ACTIVE';
  if (eventType === 'PURCHASE_COMPLETE' && purchaseStatus === 'COMPLETED') return 'ACTIVE';
  if (eventType === 'PURCHASE_COMPLETED' && purchaseStatus === 'COMPLETED') return 'ACTIVE';
  if (eventType === 'PURCHASE_CANCELED' || purchaseStatus === 'CANCELED') return 'CANCELED';
  if (eventType === 'PURCHASE_REFUNDED' || purchaseStatus === 'REFUNDED') return 'REFUNDED';
  if (eventType === 'PURCHASE_PROTEST' || purchaseStatus === 'DISPUTE') return 'CHARGEBACK';
  if (eventType === 'SUBSCRIPTION_EXPIRED') return 'PAST_DUE';
  if (eventType === 'SUBSCRIPTION_SUSPENDED') return 'SUSPENDED';
  if (eventType === 'SUBSCRIPTION_TRIAL') return 'TRIAL';
  return 'UNKNOWN';
}

export function calculateExpirationDate(
  event: HotmartEvent,
  mappedStatus: MappedAccessStatus,
  now: Date = new Date()
): string | null {
  if (mappedStatus !== 'ACTIVE') {
    return null;
  }

  const explicitNextChargeDate =
    toIsoTimestamp(event.data.subscription?.next_charge_date) ||
    toIsoTimestamp(event.data.purchase?.date_next_charge);
  if (explicitNextChargeDate) {
    return explicitNextChargeDate;
  }

  const hasSubscriptionContext = Boolean(event.data.subscription?.subscriber?.code || event.data.subscription?.plan?.id);
  if (hasSubscriptionContext) {
    const baseDate =
      parseTimestamp(event.data.purchase?.approved_date) ||
      parseTimestamp(event.data.purchase?.order_date) ||
      parseTimestamp(event.creation_date) ||
      now;

    return addMonths(baseDate, 1).toISOString();
  }

  return new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString();
}

export function getHotmartReference(event: HotmartEvent): string | null {
  return event.data.purchase?.transaction || event.data.subscription?.subscriber?.code || null;
}

export function generateWebhookIdempotencyKey(event: HotmartEvent, rawBody: string): string {
  if (event.id) {
    return event.id;
  }

  const eventType = event.event;
  const reference = getHotmartReference(event) || '';
  const idempotencyData = `${eventType}-${reference}-${rawBody}`;
  return crypto.createHash('sha256').update(idempotencyData).digest('hex');
}

export async function processHotmartEvent(
  event: HotmartEvent,
  idempotencyKey: string,
  deps: WebhookProcessingDeps,
  now: Date = new Date()
): Promise<Record<string, unknown>> {
  if (!event.event) {
    throw new Error('Missing required event data: event type');
  }

  const buyerEmail = extractBuyerEmail(event);
  if (!buyerEmail) {
    throw new Error('Missing required event data: buyer email');
  }

  const mappedStatus = mapHotmartStatus(event.event, event.data.purchase?.status);
  const expiresAt = calculateExpirationDate(event, mappedStatus, now);
  const hotmartReference = getHotmartReference(event);

  const hpIdNum = event.data.product?.id;
  if (hpIdNum === undefined || hpIdNum === null) {
    throw new Error('Missing product ID from Hotmart event');
  }

  const hotmartProductId = parseInt(String(hpIdNum), 10);
  if (Number.isNaN(hotmartProductId)) {
    throw new Error('Invalid product ID from Hotmart event');
  }

  const ucode = event.data.product?.ucode || `unknown-${hotmartProductId}`;
  const productName = event.data.product?.name || `Produto Hotmart ${hotmartProductId}`;

  await deps.upsertCustomer(buyerEmail);

  const customerRow = await deps.findCustomerByEmail(buyerEmail);
  if (!customerRow) {
    throw new Error('Customer not found after upsert');
  }

  await deps.upsertProduct({
    hotmart_product_id: hotmartProductId,
    ucode,
    name: productName,
    status: 'ACTIVE',
    is_subscription: Boolean(event.data.subscription),
    active: true,
    updated_at: now.toISOString()
  });

  const existingCustomerProduct = await deps.findCustomerProduct(customerRow.id, hotmartProductId);
  const nowIso = now.toISOString();

  if (existingCustomerProduct) {
    await deps.updateCustomerProduct(existingCustomerProduct.id, {
      hotmart_reference: hotmartReference,
      status: mappedStatus,
      expires_at: mappedStatus === 'ACTIVE' ? expiresAt : existingCustomerProduct.expires_at || nowIso,
      updated_at: nowIso
    });
  } else {
    await deps.insertCustomerProduct({
      customer_id: customerRow.id,
      hotmart_product_id: hotmartProductId,
      hotmart_reference: hotmartReference,
      status: mappedStatus,
      expires_at: mappedStatus === 'ACTIVE' ? expiresAt : nowIso,
      created_at: nowIso,
      updated_at: nowIso
    });
  }

  await deps.insertLedger({
    idempotency_key: idempotencyKey,
    event_type: event.event,
    hotmart_reference: hotmartReference,
    buyer_email: buyerEmail,
    product_id: String(hotmartProductId),
    offer_code: event.data.purchase?.offer?.code || null,
    plan_id: event.data.subscription?.plan?.id ? String(event.data.subscription.plan.id) : null,
    purchase_status: event.data.purchase?.status || null,
    subscription_status: event.data.subscription?.status || null,
    order_date: toIsoTimestamp(event.data.purchase?.order_date),
    approved_date: toIsoTimestamp(event.data.purchase?.approved_date),
    next_charge_date:
      toIsoTimestamp(event.data.subscription?.next_charge_date) ||
      toIsoTimestamp(event.data.purchase?.date_next_charge),
    processing_status: 'PROCESSED',
    processed_at: nowIso
  });

  return {
    status: 'processed',
    customer_id: customerRow.id,
    hotmart_product_id: hotmartProductId,
    hotmart_reference: hotmartReference,
    mapped_status: mappedStatus,
    expires_at: expiresAt
  };
}
