const BASE_URL = 'http://localhost:3000';

async function postWebhook(body: any, token: string) {
  const res = await fetch(`${BASE_URL}/webhooks/hotmart`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-HOTMART-HOTTOK': token,
      'User-Agent': 'Hotmart-Webhook/2.0'
    },
    body: JSON.stringify(body)
  });
  const text = await res.text();
  console.log(`POST /webhooks/hotmart → ${res.status}`);
  console.log(text);
  return { status: res.status, body: text };
}

async function getAccessValidate(email: string, mentor: string, apiKey: string) {
  const url = `${BASE_URL}/access/validate?email=${encodeURIComponent(email)}&mentor=${encodeURIComponent(mentor)}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'X-API-KEY': apiKey
    }
  });
  const text = await res.text();
  console.log(`GET /access/validate → ${res.status}`);
  console.log(text);
  return { status: res.status, body: text };
}

async function run() {
  const TOKEN = process.env.HOTMART_WEBHOOK_TOKEN || '';
  const API_KEY = process.env.API_KEY || '';
  const email = 'comprador.gpt@example.com';

  const payload = {
    id: 'evt-test-001',
    event: 'PURCHASE_APPROVED',
    version: '2.0.0',
    data: {
      buyer: { email },
      purchase: { transaction: 'TX-TEST-001', status: 'APPROVED' }
    }
  };

  console.log('=== Teste: Webhook sucesso ===');
  await postWebhook(payload, TOKEN);

  console.log('\n=== Teste: Webhook duplicado (idempotência) ===');
  await postWebhook(payload, TOKEN);

  console.log('\n=== Teste: Webhook com token inválido ===');
  await postWebhook(payload, 'invalid-token');

  console.log('\n=== Teste: GET /access/validate com API key válida ===');
  await getAccessValidate(email, 'java', API_KEY);

  console.log('\n=== Teste: GET /access/validate com API key inválida ===');
  await getAccessValidate(email, 'java', 'wrong-key');
}

run().catch(err => {
  console.error('Erro nos testes HTTP:', err);
});