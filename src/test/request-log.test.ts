import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequestId, maskEmail } from '../utils/request-log';

test('maskEmail mascara email de forma consistente', () => {
  assert.equal(maskEmail('otavio.cferreira@gmail.com'), 'o***a@g***l.com');
  assert.equal(maskEmail('ab@cd.com'), 'a***@c***.com');
  assert.equal(maskEmail(''), null);
  assert.equal(maskEmail(undefined), null);
});

test('createRequestId gera prefixo esperado', () => {
  const requestId = createRequestId();
  assert.match(requestId, /^req_[a-f0-9]{8}$/);
});
