export interface HotmartEvent {
  id: string;
  event: string;
  version: string;
  creation_date: number; // Timestamp em milissegundos
  data: {
    buyer: {
      email: string;
      name: string;
      document: string;
      document_type: string;
      first_name?: string;
      last_name?: string;
      address?: {
        city: string;
        country: string;
        country_iso: string;
        state: string;
        neighborhood: string;
        zipcode: string;
        address: string;
        number: string;
        complement?: string;
      };
      checkout_phone_code?: string;
      checkout_phone?: string;
    };
    product: {
      id: number;
      name: string;
      ucode: string;
      warranty_date?: string;
      support_email?: string;
      has_co_production?: boolean;
      is_physical_product?: boolean;
      content?: {
        has_physical_products: boolean;
        products: Array<{
          id: number;
          ucode: string;
          name: string;
          is_physical_product: boolean;
        }>;
      };
    };
    purchase: {
      transaction: string;
      status: string;
      price: {
        value: number;
        currency_value: string;
      };
      full_price?: {
        value: number;
        currency_value: string;
      };
      original_offer_price?: {
        value: number;
        currency_value: string;
      };
      payment: {
        type: string;
        installments_number: number;
      };
      approved_date?: number; // Timestamp em milissegundos
      order_date?: number; // Timestamp em milissegundos
      date_next_charge?: number; // Timestamp em milissegundos
      offer?: {
        code: string;
        coupon_code?: string;
        description?: string;
      };
      order_bump?: {
        is_order_bump: boolean;
        parent_purchase_transaction?: string;
      };
      event_tickets?: {
        amount: number;
      };
      checkout_country?: {
        name: string;
        iso: string;
      };
      sckPaymentLink?: string;
      is_funnel?: boolean;
      business_model?: string;
      invoice_by?: string;
      subscription_anticipation_purchase?: boolean;
      recurrence_number?: number;
    };
    subscription?: {
      status: string;
      plan: {
        id: number;
        name: string;
      };
      subscriber: {
        code: string; // ID da assinatura
      };
      next_charge_date?: number; // Timestamp em milissegundos
    };
    affiliates?: Array<{
      affiliate_code: string;
      name: string;
    }>;
    commissions?: Array<{
      value: number;
      source: string;
      currency_value: string;
    }>;
    producer?: {
      name: string;
      document: string;
      legal_nature: string;
    };
  };
}

// Novos tipos baseados na estrutura SQL do usuário
export type AccessStatus = 'ACTIVE' | 'CANCELED' | 'REFUNDED' | 'CHARGEBACK' | 'PAST_DUE' | 'SUSPENDED' | 'TRIAL' | 'UNKNOWN';

export interface Customer {
  id: string;
  email: string;
  created_at: string;
}

export interface Subscription {
  id: string;
  customer_id: string;
  hotmart_reference: string | null;
  product_id: string | null;
  offer_id: string | null;
  plan_code: string | null;
  status: AccessStatus;
  current_period_end: string | null;
  canceled_at: string | null;
  updated_at: string;
  created_at: string;
}

export interface MentorAccess {
  id: string;
  customer_id: string;
  mentor_slug: string;
  allowed: boolean;
  expires_at: string | null;
  source: string;
  updated_at: string;
  created_at: string;
}

export interface HotmartEventLedger {
  id: string;
  idempotency_key: string;
  event_type: string;
  hotmart_reference: string | null;
  buyer_email: string | null;
  processing_status: 'RECEIVED' | 'PROCESSED' | 'FAILED';
  error: string | null;
  payload: any;
  received_at: string;
  processed_at: string | null;
}

export interface AccessValidationResponse {
  allowed: boolean;
  mentor: string;
  expires_at: string | null;
  source: string;
  plan: string | null;
  products?: number[];
}