import { randomUUID } from 'node:crypto';

export interface DiagnosticLogger {
  requestId: string;
  info(stage: string, message: string, meta?: Record<string, unknown>): void;
  error(stage: string, error: unknown, meta?: Record<string, unknown>): void;
}

export function createRequestId(): string {
  return `req_${randomUUID().replace(/-/g, '').slice(0, 8)}`;
}

export function maskEmail(email: string | null | undefined): string | null {
  if (!email) return null;

  const trimmed = email.trim();
  if (!trimmed) return null;

  const parts = trimmed.split('@');
  if (parts.length !== 2) {
    return maskSegment(trimmed);
  }

  const [localPart, domainPart] = parts;
  const domainSegments = domainPart.split('.');
  const domainName = domainSegments.shift() ?? '';
  const domainSuffix = domainSegments.length > 0 ? `.${domainSegments.join('.')}` : '';

  return `${maskSegment(localPart)}@${maskSegment(domainName)}${domainSuffix}`;
}

export function createDiagnosticLogger(context: { requestId?: string; method: string; endpoint: string }): DiagnosticLogger {
  const requestId = context.requestId ?? createRequestId();

  return {
    requestId,
    info(stage, message, meta) {
      console.log(formatLogLine('INFO', requestId, context.method, context.endpoint, stage, message, meta));
    },
    error(stage, error, meta) {
      const payload: Record<string, unknown> = {
        ...(meta ?? {}),
        error_message: extractErrorMessage(error)
      };

      console.error(formatLogLine('ERROR', requestId, context.method, context.endpoint, stage, 'request failed', payload));

      if (error instanceof Error && error.stack) {
        console.error(`[${requestId}] stack=${JSON.stringify(error.stack)}`);
      }
    }
  };
}

function maskSegment(value: string): string {
  if (!value) return '';
  if (value.length <= 2) return `${value[0] ?? '*'}***`;

  return `${value[0]}***${value[value.length - 1]}`;
}

function formatLogLine(
  level: 'INFO' | 'ERROR',
  requestId: string,
  method: string,
  endpoint: string,
  stage: string,
  message: string,
  meta?: Record<string, unknown>
): string {
  const fields = [`ts=${new Date().toISOString()}`, `level=${level}`, `[${requestId}]`, method, endpoint, `stage=${stage}`, message];

  if (meta) {
    const metaTokens = Object.entries(meta)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => `${key}=${formatValue(value)}`);

    fields.push(...metaTokens);
  }

  return fields.join(' ');
}

function formatValue(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return JSON.stringify(value);
  if (typeof value === 'object') return JSON.stringify(value);
  if (typeof value === 'string') return JSON.stringify(value);
  return String(value);
}

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Unknown error';
}
