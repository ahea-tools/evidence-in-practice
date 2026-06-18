import { BACKEND_URL, TOOL_ID } from './constants.js';
import { isEvidenceOutput } from './schema.js';
import type { EvidenceOutput, GenerationInput, UsageState } from './types.js';

const endpoint = (path: string): string => `${BACKEND_URL.replace(/\/$/, '')}${path}`;

async function safeJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return {};
  }
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function pick(body: Record<string, unknown>, key: string): unknown {
  return body[key] ?? record(body.usage)[key] ?? record(body.paywall)[key] ?? record(body.access)[key] ?? record(body.error)[key];
}

function pickTopFirst(body: Record<string, unknown>, key: string): unknown {
  return body[key] !== undefined ? body[key] : record(body.usage)[key] ?? record(body.paywall)[key] ?? record(body.access)[key] ?? record(body.error)[key];
}

const numericDisplay = (value: unknown): number | string | undefined => (typeof value === 'number' || typeof value === 'string' ? value : undefined);
const textDisplay = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);

export function normalizeUsage(raw: unknown): UsageState {
  const body = record(raw);
  const generationsUsed = numericDisplay(pickTopFirst(body, 'generationsUsed'));
  const freeGenerationsLimit = numericDisplay(pickTopFirst(body, 'freeGenerationsLimit'));
  const explicitRemaining = numericDisplay(pickTopFirst(body, 'remainingFreeGenerations')) ?? numericDisplay(pickTopFirst(body, 'freeGenerationsRemaining'));
  const fallbackRemaining = explicitRemaining === undefined && typeof generationsUsed === 'number' && typeof freeGenerationsLimit === 'number'
    ? Math.max(freeGenerationsLimit - generationsUsed, 0)
    : undefined;

  const usage: UsageState = {
    blocked: pick(body, 'blocked') === true || pick(body, 'paywalled') === true,
  };
  const remainingFreeGenerations = explicitRemaining ?? fallbackRemaining;
  const accessStatus = textDisplay(pick(body, 'accessStatus')) ?? textDisplay(pick(body, 'status')) ?? textDisplay(pick(body, 'accessState'));
  const message = textDisplay(pick(body, 'message'));
  const paywallUrl = textDisplay(pick(body, 'paywallUrl'));
  const authenticated = typeof body.authenticated === 'boolean' ? body.authenticated : typeof body.isAuthenticated === 'boolean' ? body.isAuthenticated : undefined;
  const verified = typeof body.verified === 'boolean' ? body.verified : typeof body.isVerified === 'boolean' ? body.isVerified : undefined;

  if (generationsUsed !== undefined) usage.generationsUsed = generationsUsed;
  if (freeGenerationsLimit !== undefined) usage.freeGenerationsLimit = freeGenerationsLimit;
  if (remainingFreeGenerations !== undefined) usage.remainingFreeGenerations = remainingFreeGenerations;
  if (accessStatus !== undefined) usage.accessStatus = accessStatus;
  if (message !== undefined) usage.message = message;
  if (paywallUrl !== undefined) usage.paywallUrl = paywallUrl;
  if (authenticated !== undefined) usage.authenticated = authenticated;
  if (verified !== undefined) usage.verified = verified;

  return usage;
}

export async function fetchMe(): Promise<UsageState> {
  const response = await fetch(endpoint('/api/me'), {
    method: 'GET',
    credentials: 'include',
  });
  return normalizeUsage(await safeJson(response));
}

export async function startAuth(email: string): Promise<{ ok: boolean; message?: string }> {
  const response = await fetch(endpoint('/api/auth/start'), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, toolId: TOOL_ID }),
  });
  const body = record(await safeJson(response));
  const message = textDisplay(body.message);
  return message === undefined ? { ok: response.ok } : { ok: response.ok, message };
}

export type GenerateResult =
  | { kind: 'success'; output: EvidenceOutput; usage: UsageState }
  | { kind: 'blocked' | 'error' | 'invalid'; message: string; usage: UsageState };

export async function generateEvidence(input: GenerationInput): Promise<GenerateResult> {
  const response = await fetch(endpoint('/api/generate'), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ toolId: TOOL_ID, input }),
  });
  const body = record(await safeJson(response));
  const usage = normalizeUsage(body);
  const message = textDisplay(pick(body, 'message')) ?? 'We couldn’t complete this request. Please try again in a moment.';

  if (!response.ok) return { kind: usage.blocked ? 'blocked' : 'error', message, usage };
  if (body.status !== undefined && body.status !== 'success') return { kind: usage.blocked ? 'blocked' : 'error', message, usage };
  if (!isEvidenceOutput(body.output)) {
    return { kind: 'invalid', message: 'We received the response, but could not display it in the expected format. Please try again in a moment.', usage };
  }

  return { kind: 'success', output: body.output, usage };
}
