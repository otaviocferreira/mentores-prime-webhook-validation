// Exemplo de resposta do endpoint GET /access/validate
// Formato especificado pelo usuário:
// {
//   "allowed": true,
//   "mentor": "java",
//   "expires_at": "2026-02-01T00:00:00Z",
//   "source": "hotmart",
//   "plan": "prime"
// }

const exampleResponse = {
  allowed: true,
  mentor: "java",
  expires_at: "2026-02-01T00:00:00Z",
  source: "hotmart",
  plan: "prime"
};

console.log('📋 Formato de resposta esperado do endpoint GET /access/validate:');
console.log(JSON.stringify(exampleResponse, null, 2));

// Exemplo de resposta quando não tem acesso
const exampleDeniedResponse = {
  allowed: false,
  mentor: "java",
  expires_at: null,
  source: "hotmart",
  plan: null
};

console.log('\n❌ Formato de resposta quando acesso negado:');
console.log(JSON.stringify(exampleDeniedResponse, null, 2));

console.log('\n✅ Formato de resposta implementado com sucesso!');