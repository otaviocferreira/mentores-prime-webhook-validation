# Hotmart Webhook API

API para receber webhooks da Hotmart e validar acessos de clientes a mentores.

## Arquitetura

- **Node.js + Express + TypeScript**
- **Supabase (PostgreSQL)**
- **Deploy: Render (recomendado)**

## Endpoints

### 1. Receber Webhook da Hotmart
```
POST /webhooks/hotmart
Headers:
  X-HOTMART-HOTTOK: seu_token_aqui

Body: Evento da Hotmart (JSON)
```

### 2. Validar Acesso
```
GET /access/validate?email=email@exemplo.com&mentor=nome_mentor
Headers:
  X-API-KEY: sua_chave_api
```

## Configuração

1. Copie `.env.example` para `.env` e preencha as variáveis:
```bash
cp .env.example .env
```

2. Instale as dependências:
```bash
npm install
```

3. Execute em desenvolvimento:
```bash
npm run dev
```

4. Build para produção:
```bash
npm run build
npm start
```

## Estrutura do Banco de Dados

### Tabelas
- `customers`: Dados dos clientes
- `subscriptions`: Assinaturas dos clientes
- `mentor_access`: Acessos dos clientes aos mentores
- `hotmart_event_ledger`: Registro de eventos processados

### Função SQL
- `process_hotmart_event()`: Processa eventos de forma transacional

## Deploy no Render

1. Conecte seu repositório no Render
2. Configure as variáveis de ambiente
3. Build command: `npm run build`
4. Start command: `npm start`

## Segurança

- Validação de token do webhook Hotmart
- Idempotência de eventos
- Proteção de API endpoints com chave
- Uso de Service Role Key do Supabase no backend