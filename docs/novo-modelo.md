# 🔄 Novo Modelo de Dados - Hotmart Webhook API

## Visão Geral

O backend foi atualizado para usar um novo modelo de dados mais simples e eficiente, baseado em:

- **customers**: Dados dos clientes
- **hotmart_products**: Produtos cadastrados na Hotmart
- **product_mentor_map**: Mapeamento de quais mentores cada produto libera
- **customer_products**: Relação de quais produtos cada cliente comprou
- **hotmart_event_ledger_min**: Auditoria de eventos processados

## Mudanças Principais

### 1. Removido o modelo antigo
- ❌ `entitlements` (acessos manuais)
- ❌ `subscriptions` (assinaturas)
- ❌ `mentor_access` (acessos por mentor)
- ❌ Lista fixa de mentores no código

### 2. Novo modelo simplificado
- ✅ Um produto Hotmart libera acesso a múltiplos mentores via `product_mentor_map`
- ✅ O acesso é verificado dinamicamente via `customer_products` + `product_mentor_map`
- ✅ Sem lógica de mentores hardcoded - tudo via banco de dados

## Fluxo de Webhook

### Requisição
```http
POST /webhooks/hotmart
Headers:
  X-HOTMART-HOTTOK: seu_token_aqui

Body: Evento da Hotmart (JSON)
```

### Processamento
1. **Autenticação**: Valida `X-HOTMART-HOTTOK`
2. **Idempotência**: Usa `event.id` ou SHA256 do conteúdo
3. **Extração de dados**:
   - `buyer_email` = `event.data.buyer.email`
   - `hotmart_product_id` = `event.data.product.id`
   - `ucode` = `event.data.product.ucode`
   - `hotmart_reference` = `purchase.transaction` ou `subscription.subscriber.code`
4. **Mapeamento de status**:
   - `PURCHASE_APPROVED` + `APPROVED` → `ACTIVE`
   - `PURCHASE_CANCELED` → `CANCELED`
   - `PURCHASE_REFUNDED` → `REFUNDED`
   - `PURCHASE_PROTEST` → `CHARGEBACK`
   - `SUBSCRIPTION_EXPIRED` → `PAST_DUE`
   - `SUBSCRIPTION_SUSPENDED` → `SUSPENDED`
   - `SUBSCRIPTION_TRIAL` → `TRIAL`
   - Outros → `UNKNOWN`
5. **Expiração**:
   - Status `ACTIVE`: `now() + 1 year` ou usa `next_charge_date` se disponível
   - Outros status: expira imediatamente
6. **Chamada da função**: `process_hotmart_event_v2()`

### Função SQL `process_hotmart_event_v2`
```sql
SELECT * FROM public.process_hotmart_event_v2(
  p_idempotency_key := 'event-123',
  p_event_type := 'PURCHASE_APPROVED',
  p_hotmart_reference := 'HP16015479281022',
  p_buyer_email := 'cliente@example.com',
  p_hotmart_product_id := 12345,
  p_ucode := 'abc-123',
  p_status := 'ACTIVE',
  p_expires_at := '2025-01-23T12:00:00Z',
  p_payload := '{...}'
);
```

O que a função faz:
1. Verifica idempotência via `idempotency_key`
2. Faz upsert do customer
3. Garante que o produto existe em `hotmart_products`
4. Faz upsert em `customer_products`
5. Registra no `hotmart_event_ledger_min`

## Fluxo de Validação de Acesso

### Requisição
```http
GET /access/validate?email=cliente@example.com&mentor=java
Headers:
  X-API-KEY: sua_chave_api
```

### Processamento
1. **Autenticação**: Valida `X-API-KEY`
2. **Busca customer** pelo email
3. **Verificação de acesso**: Usa função `check_mentor_access_v2()`

### Função SQL `check_mentor_access_v2`
```sql
SELECT * FROM public.check_mentor_access_v2(
  p_customer_id := 'uuid-do-customer',
  p_mentor_slug := 'java'
);
```

A função verifica se existe:
- Um `customer_products` ativo para o customer
- Um `product_mentor_map` que conecte o produto ao mentor solicitado
- Status `ACTIVE` e não expirado

### Resposta
```json
{
  "allowed": true,
  "mentor": "java",
  "expires_at": "2025-01-23T12:00:00Z",
  "source": "product",
  "plan": "Plano Completo"
}
```

## Configuração de Mapeamento de Mentores

Para configurar quais mentores cada produto libera, use:

```sql
-- Produto 12345 libera acesso a Java, Python e React
INSERT INTO public.product_mentor_map (hotmart_product_id, mentor_slug) VALUES
(12345, 'java'),
(12345, 'python'),
(12345, 'react');
```

## Migração dos Dados

Se você tem dados no modelo antigo, será necessário:
1. Migrar `mentor_access` ativos para o novo modelo
2. Criar os mapeamentos em `product_mentor_map`
3. Popular `customer_products` baseado nos dados antigos

## Testes

Execute o teste completo:
```bash
npm run tsx src/test/new-model-test.ts
```

Isso irá:
1. Processar um evento real da Hotmart
2. Verificar se os dados foram criados corretamente
3. Testar a validação de acesso para diferentes mentores
4. Validar cenários de sucesso e erro

## Vantagens do Novo Modelo

1. **Flexibilidade**: Adicione/remova mentores por produto sem alterar código
2. **Simplicidade**: Menos tabelas e relações complexas
3. **Performance**: Queries mais simples e diretas
4. **Manutenibilidade**: Lógica centralizada no banco de dados
5. **Escalabilidade**: Fácil adicionar novos produtos e mentores

## Próximos Passos

1. Executar as migrations SQL no Supabase
2. Configurar os mapeamentos de produtos para mentores
3. Testar com dados reais da Hotmart
4. Monitorar logs e métricas
5. Ajustar conforme necessário