# 📋 Estratégia de Validação e Idempotência do Webhook Hotmart

## 🔐 Autenticação do Webhook

### Header de Validação
- **Header**: `X-HOTMART-HOTTOK`
- **Validação**: Comparação com token configurado em `HOTMART_WEBHOOK_TOKEN`
- **Segurança**: Token nunca é logado em texto puro

### Respostas de Erro de Autenticação
```json
// Header ausente
{
  "error": "Missing authentication token"
}

// Token inválido
{
  "error": "Invalid authentication token"
}
```

## 🔄 Estratégia de Idempotência

### Algoritmo de Geração da Chave

1. **Preferência 1**: Usar `event.id` se disponível
2. **Preferência 2**: `sha256(eventType + reference + rawBody)`

#### Detalhes da Implementação
```typescript
// Estrutura da chave quando event.id existe
idempotencyKey = event.id; // Ex: "37c93564-229d-4177-8907-5ff33855426d"

// Estrutura da chave quando event.id não existe
const eventType = event.event; // Ex: "PURCHASE_APPROVED"
const reference = event.data.purchase?.transaction || event.data.subscription?.subscriber?.code || '';
const rawBody = JSON.stringify(req.body);
const idempotencyData = `${eventType}-${reference}-${rawBody}`;
idempotencyKey = crypto.createHash('sha256').update(idempotencyData).digest('hex');
```

### Exemplos de Chaves Geradas

#### Evento com ID
```json
{
  "id": "hotmart-event-123",
  "event": "PURCHASE_APPROVED",
  "data": {
    "purchase": { "transaction": "TX123" }
  }
}
// Chave gerada: "hotmart-event-123"
```

#### Evento sem ID (Purchase)
```json
{
  "event": "PURCHASE_APPROVED",
  "data": {
    "purchase": { "transaction": "TX456" }
  }
}
// Chave gerada: "a68e65fbbf12d0fde989a1e9bfd95f4e6858e9164c2ce75995dc376b1780d5dc"
```

#### Evento de Subscription
```json
{
  "event": "SUBSCRIPTION_ACTIVATED",
  "data": {
    "subscription": {
      "subscriber": { "code": "SUB789" }
    }
  }
}
// Chave gerada: "1c836007d76e9d5b1a46d8474fc2f378643e8e8913935395b33e5cf1cac4f6af"
```

## 📊 Respostas do Webhook

### ✅ Sucesso (Evento Processado)
```json
{
  "message": "Event processed successfully",
  "idempotency_key": "37c93564-229d-4177-8907-5ff33855426d",
  "result": {
    "customer_id": "uuid-do-cliente",
    "subscription_id": "uuid-da-assinatura",
    "mentor_access_granted": ["java", "python"],
    "status": "ACTIVE"
  }
}
```

### 🔄 Evento Duplicado
```json
{
  "message": "Event already processed",
  "idempotency_key": "37c93564-229d-4177-8907-5ff33855426d",
  "duplicate": true,
  "status": "PROCESSED"
}
```

### ❌ Erro de Validação (4xx)
```json
{
  "error": "Missing required event data: event type or buyer email",
  "idempotency_key": "chave-gerada"
}
```

### ⚠️ Erro de Processamento (5xx)
```json
{
  "error": "Failed to process event",
  "idempotency_key": "chave-gerada"
}
```

## 🎯 Estratégia de Retentativas

### Comportamento com Hotmart
- Hotmart reenvia webhooks com erro até 5 vezes
- **Sempre responder 2xx** quando o evento for processado ou for duplicado
- **Responder 4xx apenas** quando houver erro real de validação

### Fluxo de Retentativas
```
1. Primeira tentativa → Processa com sucesso → 200 OK
2. Segunda tentativa (retry) → Detecta duplicata → 200 OK (duplicate: true)
3. Terceira tentativa → Mesma resposta → 200 OK (duplicate: true)
```

## 🔍 Logs e Monitoramento

### Logs de Validação
```
Webhook received without X-HOTMART-HOTTOK header
Webhook received with invalid X-HOTMART-HOTTOK header
```

### Logs de Idempotência
```
Using event.id as idempotency key: hotmart-event-123
Generated idempotency key from eventType+reference+rawBody: a68e65fbbf12d0fde989a1e9bfd95f4e6858e9164c2ce75995dc376b1780d5dc
Duplicate event detected with idempotency key: chave-detectada
Event processed as duplicate via transaction: chave-detectada
Event processed successfully: chave-processada
```

### Logs de Erro
```
No hotmart reference found for event chave, using email as fallback
Error processing event chave: mensagem-do-erro
```

## 🧪 Testes Implementados

### Testes de Idempotência
- ✅ Evento com ID usa o ID como chave
- ✅ Evento sem ID gera SHA256 corretamente
- ✅ Eventos idênticos geram mesma chave
- ✅ Eventos diferentes geram chaves diferentes
- ✅ Validação de token funciona corretamente

### Testes de Integração
- ✅ Processamento de evento único
- ✅ Detecção de eventos duplicados
- ✅ Validação de acesso após processamento

## 🔧 Configuração Necessária

### Variáveis de Ambiente
```bash
# Token do webhook Hotmart (obter no painel da Hotmart)
HOTMART_WEBHOOK_TOKEN=seu_token_aqui

# Chave da API para validação de acesso
API_KEY=sua_chave_api_segura
```

### Headers Necessários
```bash
# Para webhook
X-HOTMART-HOTTOK: seu_token_aqui

# Para validação de acesso
X-API-KEY: sua_chave_api_segura
```

## 📈 Benefícios da Estratégia

1. **Segurança**: Validação robusta de autenticidade
2. **Idempotência**: Previne processamento duplicado
3. **Resiliência**: Lida corretamente com retries da Hotmart
4. **Rastreabilidade**: Logs detalhados para debugging
5. **Performance**: Detecção rápida de duplicatas
6. **Flexibilidade**: Suporta diferentes tipos de eventos

## 🚀 Próximos Passos

1. Configurar token Hotmart no painel e na variável de ambiente
2. Testar com dados reais da Hotmart em ambiente sandbox
3. Monitorar logs para validar o comportamento
4. Ajustar timeouts e retries conforme necessário