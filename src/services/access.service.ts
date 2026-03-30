import { AccessValidationResponse } from '../types';
import { normalizeEmail } from './webhook.service';
import { DiagnosticLogger } from '../utils/request-log';

export interface CustomerProductAccessRow {
  hotmart_product_id: number;
  expires_at: string | null;
}

export interface ProductMentorMapRow {
  hotmart_product_id: number;
}

export interface AccessValidationDeps {
  findCustomerByEmail(email: string): Promise<{ id: string } | null>;
  listActiveCustomerProducts(customerId: string): Promise<CustomerProductAccessRow[]>;
  listMentorMappings(productIds: number[], mentor: string): Promise<ProductMentorMapRow[]>;
}

export interface AccessValidationParams {
  email: string | string[] | undefined;
  mentor: string | string[] | undefined;
}

export function buildDeniedAccessResponse(mentor: string): AccessValidationResponse {
  return {
    allowed: false,
    mentor,
    expires_at: null,
    source: 'product',
    plan: null,
    products: []
  };
}

export async function validateAccess(
  params: AccessValidationParams,
  deps: AccessValidationDeps,
  now: Date = new Date(),
  logger?: DiagnosticLogger
): Promise<AccessValidationResponse> {
  const emailValue = Array.isArray(params.email) ? params.email[0] : params.email;
  const mentorValue = Array.isArray(params.mentor) ? params.mentor[0] : params.mentor;

  if (!emailValue || !mentorValue) {
    logger?.info('validate_params', 'missing required parameters');
    throw new Error('Missing required parameters');
  }

  const email = normalizeEmail(emailValue);
  const mentor = mentorValue.toString().trim();

  if (!email || !mentor) {
    logger?.info('validate_params', 'normalized parameters are invalid');
    throw new Error('Missing required parameters');
  }

  logger?.info('validate_start', 'access validation started', { mentor, email_normalized: true });

  const customer = await deps.findCustomerByEmail(email);
  if (!customer) {
    logger?.info('customer_lookup', 'customer not found');
    const denied = buildDeniedAccessResponse(mentor);
    logger?.info('validate_result', 'access validation finished', { allowed: denied.allowed, products: denied.products?.length ?? 0 });
    return denied;
  }

  const customerProducts = await deps.listActiveCustomerProducts(customer.id);
  const activeProducts = customerProducts.filter((customerProduct) => {
    if (!customerProduct.expires_at) return true;
    return new Date(customerProduct.expires_at) > now;
  });

  if (activeProducts.length === 0) {
    logger?.info('product_lookup', 'no active products available', { customer_products: customerProducts.length });
    const denied = buildDeniedAccessResponse(mentor);
    logger?.info('validate_result', 'access validation finished', { allowed: denied.allowed, products: denied.products?.length ?? 0 });
    return denied;
  }

  const activeProductIds = activeProducts.map((customerProduct) => customerProduct.hotmart_product_id);
  const mappedMentors = await deps.listMentorMappings(activeProductIds, mentor);
  const allowedProductIds = mappedMentors.map((mapping) => mapping.hotmart_product_id);
  const allowed = allowedProductIds.length > 0;

  let expiresAt: string | null = null;
  if (allowed) {
    const relevantProducts = activeProducts.filter((customerProduct) =>
      allowedProductIds.includes(customerProduct.hotmart_product_id)
    );
    const hasLifetimeAccess = relevantProducts.some((customerProduct) => !customerProduct.expires_at);

    if (!hasLifetimeAccess) {
      const maxDate = relevantProducts
        .map((customerProduct) => new Date(customerProduct.expires_at as string))
        .reduce((latest, current) => (latest > current ? latest : current));
      expiresAt = maxDate.toISOString();
    }
  }

  logger?.info('validate_result', 'access validation finished', {
    allowed,
    active_products: activeProducts.length,
    mapped_products: allowedProductIds.length,
    mentor
  });

  return {
    allowed,
    mentor,
    expires_at: expiresAt,
    source: 'product',
    plan: null,
    products: allowedProductIds
  };
}

