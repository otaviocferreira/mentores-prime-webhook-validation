import { AccessValidationResponse } from '../types';
import { normalizeEmail } from './webhook.service';

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
  now: Date = new Date()
): Promise<AccessValidationResponse> {
  const emailValue = Array.isArray(params.email) ? params.email[0] : params.email;
  const mentorValue = Array.isArray(params.mentor) ? params.mentor[0] : params.mentor;

  if (!emailValue || !mentorValue) {
    throw new Error('Missing required parameters');
  }

  const email = normalizeEmail(emailValue);
  const mentor = mentorValue.toString().trim();

  if (!email || !mentor) {
    throw new Error('Missing required parameters');
  }

  const customer = await deps.findCustomerByEmail(email);
  if (!customer) {
    return buildDeniedAccessResponse(mentor);
  }

  const customerProducts = await deps.listActiveCustomerProducts(customer.id);
  const activeProducts = customerProducts.filter((customerProduct) => {
    if (!customerProduct.expires_at) return true;
    return new Date(customerProduct.expires_at) > now;
  });

  if (activeProducts.length === 0) {
    return buildDeniedAccessResponse(mentor);
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

  return {
    allowed,
    mentor,
    expires_at: expiresAt,
    source: 'product',
    plan: null,
    products: allowedProductIds
  };
}
