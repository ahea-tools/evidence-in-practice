import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { generateEvidence, normalizeUsage, startAuth, fetchMe } from '../src/api.js';
import { AHEA_TOOLS_HUB_URL, TOOL_ID } from '../src/constants.js';
import { isEvidenceOutput } from '../src/schema.js';
import { validateInput } from '../src/app.js';

const validOutput = {
  evidenceSnapshot: 'Snapshot',
  keyTakeaways: ['Takeaway'],
  whatAppearsMostEffective: ['Effective'],
  contextAndApplicability: ['Context'],
  equityConsiderations: ['Equity'],
  practiceConsiderations: ['Practice'],
  evidenceGapsAndUnansweredQuestions: ['Gap'],
  sourcesReviewed: [{ title: 'Article', year: 2024, journal: 'Journal', pmid: '123', pubmedUrl: 'https://pubmed.ncbi.nlm.nih.gov/123/' }],
};

type MockCall = { input: string | URL | Request; init?: RequestInit | undefined };
function mockFetch(responses: Array<{ ok: boolean; status?: number; body: unknown }>): MockCall[] {
  const calls: MockCall[] = [];
  globalThis.fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    calls.push({ input, init });
    const response = responses.shift() ?? { ok: true, body: {} };
    return new Response(JSON.stringify(response.body), { status: response.status ?? (response.ok ? 200 : 400) });
  };
  return calls;
}

test('constants use the required AHEA toolId and ToolHub URL', () => {
  assert.equal(TOOL_ID, 'evidence-in-practice');
  assert.equal(AHEA_TOOLS_HUB_URL, 'https://americanhealthequity.org/tools');
});

test('/api/me uses credentials include', async () => {
  const calls = mockFetch([{ ok: true, body: { generationsUsed: 0 } }]);
  await fetchMe();
  assert.match(String(calls[0]?.input), /\/api\/me$/);
  assert.equal(calls[0]?.init?.credentials, 'include');
});

test('auth/start sends email, toolId, and credentials include', async () => {
  const calls = mockFetch([{ ok: true, body: { message: 'sent' } }]);
  await startAuth('person@example.org');
  assert.match(String(calls[0]?.input), /\/api\/auth\/start$/);
  assert.equal(calls[0]?.init?.method, 'POST');
  assert.equal(calls[0]?.init?.credentials, 'include');
  assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), { email: 'person@example.org', toolId: 'evidence-in-practice' });
});

test('generate sends toolId and trimmed input shape supplied by UI', async () => {
  const calls = mockFetch([{ ok: true, body: { status: 'success', output: validOutput } }]);
  await generateEvidence({ topic: 'diabetes prevention', population: 'rural adults', setting: 'clinics' });
  assert.match(String(calls[0]?.input), /\/api\/generate$/);
  assert.equal(calls[0]?.init?.method, 'POST');
  assert.equal(calls[0]?.init?.credentials, 'include');
  assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), {
    toolId: 'evidence-in-practice',
    input: { topic: 'diabetes prevention', population: 'rural adults', setting: 'clinics' },
  });
});

test('successful generation parses body.output only', async () => {
  mockFetch([{ ok: true, body: { status: 'success', output: validOutput } }]);
  const result = await generateEvidence({ topic: 'x', population: '', setting: '' });
  assert.equal(result.kind, 'success');
});

test('data/result/generation/content wrappers are rejected', async () => {
  for (const wrapper of ['data', 'result', 'generation', 'content'] as const) {
    mockFetch([{ ok: true, body: { [wrapper]: validOutput } }]);
    const result = await generateEvidence({ topic: 'x', population: '', setting: '' });
    assert.equal(result.kind, 'invalid');
  }
});

test('malformed output returns calm output-format error', async () => {
  mockFetch([{ ok: true, body: { output: { bad: true } } }]);
  const result = await generateEvidence({ topic: 'x', population: '', setting: '' });
  assert.equal(result.kind, 'invalid');
  if (result.kind !== 'invalid') throw new Error('Expected invalid result');
  assert.match(result.message, /expected format/);
});

test('non-200 uses backend safe message and blocked/paywall state', async () => {
  mockFetch([{ ok: false, status: 402, body: { blocked: true, message: 'Membership unlocks continued access.', paywallUrl: 'https://example.org/join' } }]);
  const result = await generateEvidence({ topic: 'x', population: '', setting: '' });
  assert.equal(result.kind, 'blocked');
  if (result.kind !== 'blocked') throw new Error('Expected blocked result');
  assert.equal(result.message, 'Membership unlocks continued access.');
  assert.equal(result.usage.paywallUrl, 'https://example.org/join');
});

test('usage normalization preserves zero values and unavailable values remain undefined for display dash', () => {
  assert.deepEqual(normalizeUsage({ generationsUsed: 0, freeGenerationsLimit: 2 }), {
    generationsUsed: 0,
    freeGenerationsLimit: 2,
    remainingFreeGenerations: 2,
    blocked: false,
  });
});

test('schema validates all required Evidence in Practice output fields', () => {
  assert.equal(isEvidenceOutput(validOutput), true);
  assert.equal(isEvidenceOutput({ ...validOutput, sourcesReviewed: [{ ...validOutput.sourcesReviewed[0], pmid: 123 }] }), false);
});

test('frontend topic validation is usability-only and calm', () => {
  assert.match(validateInput({ topic: '', population: '', setting: '' }) ?? '', /Please enter/);
  assert.equal(validateInput({ topic: 'maternal health', population: '', setting: '' }), null);
});

test('source code refreshes /api/me in generation finally and renders PubMed metadata links only', async () => {
  const appSource = await readFile('src/app.ts', 'utf8');
  assert.match(appSource, /finally \{[\s\S]*await refreshMe\(\)/);
  assert.match(appSource, /source\.pubmedUrl/);
  assert.doesNotMatch(appSource, /fetch\([^\n]*(pubmed|ncbi)/i);
});
