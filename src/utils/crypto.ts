import crypto from 'crypto';
import { HotmartEvent } from '../types';

export function generateIdempotencyKey(event: HotmartEvent): string {
  const data = `${event.id}-${event.event}-${event.data.buyer.email}-${event.data.product.id}`;
  return crypto.createHash('sha256').update(data).digest('hex');
}

export function validateHotmartToken(token: string): boolean {
  const expectedToken = process.env.HOTMART_WEBHOOK_TOKEN;
  return token === expectedToken;
}

export function generateApiKey(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function validateApiKey(key: string): boolean {
  const expectedKey = process.env.API_KEY;
  return key === expectedKey;
}