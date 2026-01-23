# Hotmart Webhook API - Modelo de Dados Atualizado

## Visão Geral do Modelo de Dados

O MVP foi atualizado para refletir o modelo de dados especificado, com as seguintes tabelas:

### 1. customers
```sql
CREATE TABLE customers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

**Campos:**
- `id`: UUID único do cliente
- `email`: Email único do cliente (chave primária de negócio)
- `created_at`: Timestamp de criação

### 2. subscriptions
```sql
CREATE TABLE subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID NOT NULL,
  product_id INTEGER NOT NULL,
  transaction_id TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL, -- ACTIVE, CANCELED, REFUNDED, CHARGEBACK, EXPIRED, PENDING
  plan_id INTEGER,
  offer_id TEXT,
  current_period_end TIMESTAMP WITH TIME ZONE,
  canceled_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

**Campos:**
- `id`: UUID único da assinatura
- `customer_id`: Referência para o cliente
- `product_id`: ID do produto na Hotmart
- `transaction_id`: ID da transação (único)
- `status`: Estado atual (mapeamento dos eventos Hotmart)
- `plan_id`: ID do plano
- `offer_id`: ID da oferta
- `current_period_end`: Fim do período atual
- `canceled_at`: Data de cancelamento (se aplicável)
- `created_at`: Timestamp de criação

### 3. mentor_access
```sql
CREATE TABLE mentor_access (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID NOT NULL,
  customer_email TEXT NOT NULL,
  mentor_slug TEXT NOT NULL,
  allowed BOOLEAN DEFAULT true,
  source TEXT DEFAULT 'hotmart',
  expires_at TIMESTAMP WITH TIME ZONE,
  limits JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(customer_email, mentor_slug)
);
```

**Campos:**
- `id`: UUID único do acesso
- `customer_id`: Referência para o cliente
- `customer_email`: Email do cliente (para busca rápida)
- `mentor_slug`: Slug do mentor (ex: 'carlos', 'joao', 'maria')
- `allowed`: Se o acesso está permitido
- `source`: Fonte do acesso (sempre 'hotmart' por enquanto)
- `expires_at`: Data de expiração do acesso
- `limits`: Limites em JSON (chamadas, mensagens, etc.)
- `created_at`: Timestamp de criação
- `updated_at`: Timestamp de última atualização

### 4. hotmart_event_ledger
```sql
CREATE TABLE hotmart_event_ledger (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  idempotency_key TEXT UNIQUE NOT NULL,
  hotmart_reference TEXT, -- transaction_id ou subscription_id
  payload JSONB NOT NULL,
  processing_status TEXT DEFAULT 'pending', -- pending, processing, completed, failed
  received_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  error TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

**Campos:**
- `id`: UUID único do evento
- `event_id`: ID do evento da Hotmart
- `event_type`: Tipo do evento
- `idempotency_key`: Chave de idempotência (única)
- `hotmart_reference`: Referência da Hotmart (transaction_id ou subscription_id)
- `payload`: Dados completos do evento em JSON
- `processing_status`: Status do processamento
- `received_at`: Quando foi recebido
- `error`: Mensagem de erro (se houver)
- `created_at`: Timestamp de criação

## Mapeamento de Estados

A função `map_hotmart_status()` mapeia os eventos da Hotmart para estados internos:

| Evento Hotmart | Estado Interno |
|----------------|------------------|
| PURCHASE_APPROVED, PURCHASE_COMPLETED, PURCHASE_BILLET_PRINTED | ACTIVE |
| CANCELLED_PURCHASE, SUBSCRIPTION_CANCELLATION | CANCELED |
| REFUNDED_PURCHASE, PARTIAL_REFUND | REFUNDED |
| CHARGEBACK | CHARGEBACK |
| SUBSCRIPTION_EXPIRATION, ACCESS_EXPIRED | EXPIRED |
| Outros status | PENDING |

## Endpoints da API

### 1. Webhook Receiver
```
POST /webhooks/hotmart
Headers:
  X-HOTMART-HOTTOK: seu_token_aqui

Body: Evento da Hotmart (JSON)
```

### 2. Validação de Acesso
```
GET /access/validate?email=email@exemplo.com&mentor=carlos
Headers:
  X-API-KEY: sua_chave_api

Response:
{
  "allowed": true,
  "expires_at": "2025-01-23T10:00:00Z",
  "plan": 123,
  "limits": {"calls": 100, "messages": 1000}
}
```

## Configuração

1. Configure as variáveis de ambiente no arquivo `.env`
2. Execute as migrations no Supabase
3. Configure o webhook na Hotmart com o endpoint `/webhooks/hotmart`
4. Use a API de validação para verificar acessos dos clientes