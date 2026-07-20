import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { generateEvidence, normalizeUsage, startAuth, fetchMe } from '../src/api.js';
import { AHEA_TOOLS_HUB_URL, TOOL_ID } from '../src/constants.js';
import { isEvidenceOutput } from '../src/schema.js';
import { mount, validateInput } from '../src/app.js';

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


type TestListener = (event: Event) => void | Promise<void>;

class TestTextNode {
  readonly nodeType = 3;
  constructor(readonly textContent: string) {}
}

class TestElement {
  readonly nodeType = 1;
  readonly childNodes: Array<TestElement | TestTextNode> = [];
  readonly attrs = new Map<string, string>();
  readonly listeners = new Map<string, TestListener[]>();
  value = '';
  disabled = false;

  constructor(readonly tagName: string) {}

  setAttribute(key: string, value: string): void {
    this.attrs.set(key, value);
    if (key === 'value') this.value = value;
    if (key === 'disabled') this.disabled = true;
  }

  addEventListener(eventName: string, listener: TestListener): void {
    this.listeners.set(eventName, [...(this.listeners.get(eventName) ?? []), listener]);
  }

  appendChild(child: TestElement | TestTextNode): void {
    this.childNodes.push(child);
  }

  replaceChildren(): void {
    this.childNodes.splice(0);
  }

  get textContent(): string {
    return this.childNodes.map((child) => child.textContent).join('');
  }

  querySelector(selector: string): TestElement | null {
    if (selector.startsWith('#') && this.attrs.get('id') === selector.slice(1)) return this;
    if (!selector.startsWith('#') && this.tagName === selector) return this;
    for (const child of this.childNodes) {
      if (child instanceof TestElement) {
        const match = child.querySelector(selector);
        if (match) return match;
      }
    }
    return null;
  }
}

function setupDocument(): TestElement {
  const root = new TestElement('div');
  (globalThis as unknown as { document: { createElement: (tag: string) => TestElement; createTextNode: (text: string) => TestTextNode } }).document = {
    createElement: (tag: string): TestElement => new TestElement(tag),
    createTextNode: (text: string): TestTextNode => new TestTextNode(text),
  };
  return root;
}

async function submitAuthForm(root: TestElement): Promise<void> {
  const form = root.querySelector('form');
  const listener = form?.listeners.get('submit')?.[0];
  if (!listener) throw new Error('Missing auth form submit listener');
  await listener({ preventDefault: () => undefined } as Event);
}

type MockCall = { input: string | URL | Request; init?: RequestInit | undefined };

async function rejects(promiseFactory: () => Promise<unknown>, pattern: RegExp): Promise<void> {
  try {
    await promiseFactory();
  } catch (error) {
    assert.match(error instanceof Error ? error.message : String(error), pattern);
    return;
  }
  throw new Error('Expected promise to reject');
}

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

test('/api/me loads usable authenticated account state with credentials include', async () => {
  const calls = mockFetch([{ ok: true, body: { authenticated: true, verified: true, generationsUsed: 0, freeGenerationsLimit: 2, remainingFreeGenerations: 2, accessStatus: 'free' } }]);
  const usage = await fetchMe();
  assert.match(String(calls[0]?.input), /\/api\/me$/);
  assert.equal(calls[0]?.init?.credentials, 'include');
  assert.equal(usage.authenticated, true);
  assert.equal(usage.verified, true);
  assert.equal(usage.generationsUsed, 0);
});

test('/api/me accepts explicit unauthenticated or unverified account state', async () => {
  mockFetch([{ ok: true, body: { authenticated: false, generationsUsed: 0 } }]);
  assert.equal((await fetchMe()).authenticated, false);

  mockFetch([{ ok: true, body: { verified: false, freeGenerationsLimit: 2 } }]);
  assert.equal((await fetchMe()).verified, false);
});

test('/api/me rejects non-200, invalid JSON, and missing authentication state', async () => {
  mockFetch([{ ok: false, status: 500, body: { message: 'nope' } }]);
  await rejects(fetchMe, /Account status request failed/);

  globalThis.fetch = async (): Promise<Response> => new Response('{bad json', { status: 200 });
  await rejects(fetchMe, /Invalid JSON response/);

  mockFetch([{ ok: true, body: { generationsUsed: 0, freeGenerationsLimit: 2 } }]);
  await rejects(fetchMe, /missing authentication state/);
});

test('auth/start sends email, toolId, and credentials include', async () => {
  const calls = mockFetch([{ ok: true, body: { message: 'sent' } }]);
  await startAuth(' person@example.org ');
  assert.match(String(calls[0]?.input), /\/api\/auth\/start$/);
  assert.equal(calls[0]?.init?.method, 'POST');
  assert.equal(calls[0]?.init?.credentials, 'include');
  assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), { email: 'person@example.org', toolId: 'evidence-in-practice' });
});


test('auth form captures entered email before loading rerender and preserves it visibly', async () => {
  const root = setupDocument();
  const calls: MockCall[] = [];
  let resolveAuth: ((response: Response) => void) | undefined;
  globalThis.fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    calls.push({ input, init });
    if (String(input).endsWith('/api/me')) {
      return new Response(JSON.stringify({ authenticated: false, verified: false, generationsUsed: 0 }), { status: 200 });
    }
    return new Promise<Response>((resolve) => {
      resolveAuth = resolve;
    });
  };

  await mount(root as unknown as HTMLElement);
  const emailInput = root.querySelector('#email');
  if (!emailInput) throw new Error('Missing email input');
  emailInput.value = ' person@example.com ';

  const submitPromise = submitAuthForm(root);
  const authCall = calls.find((call) => String(call.input).endsWith('/api/auth/start'));
  assert.deepEqual(JSON.parse(String(authCall?.init?.body)), { email: 'person@example.com', toolId: 'evidence-in-practice' });
  assert.equal(authCall?.init?.credentials, 'include');
  assert.equal(root.querySelector('#email')?.value, 'person@example.com');
  assert.match(root.textContent, /Sending…/);

  resolveAuth?.(new Response(JSON.stringify({ message: 'Check your email.' }), { status: 200 }));
  await submitPromise;
  assert.match(root.textContent, /Check your email\./);
  assert.equal(root.querySelector('#email')?.value, 'person@example.com');
});

test('empty auth email does not call backend and asks for an email address', async () => {
  const root = setupDocument();
  const calls = mockFetch([{ ok: true, body: { authenticated: false, verified: false } }]);
  await mount(root as unknown as HTMLElement);
  const emailInput = root.querySelector('#email');
  if (!emailInput) throw new Error('Missing email input');
  emailInput.value = '   ';

  await submitAuthForm(root);
  assert.equal(calls.filter((call) => String(call.input).endsWith('/api/auth/start')).length, 0);
  assert.match(root.textContent, /Please enter an email address\./);
});

test('rejected auth request restores loading state and displays calm error', async () => {
  const root = setupDocument();
  const calls: MockCall[] = [];
  globalThis.fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    calls.push({ input, init });
    if (String(input).endsWith('/api/me')) {
      return new Response(JSON.stringify({ authenticated: false, verified: false }), { status: 200 });
    }
    throw new Error('network down');
  };

  await mount(root as unknown as HTMLElement);
  const emailInput = root.querySelector('#email');
  if (!emailInput) throw new Error('Missing email input');
  emailInput.value = 'person@example.com';

  await submitAuthForm(root);
  assert.match(root.textContent, /We could not start sign-in\. Please try again in a moment\./);
  assert.match(root.textContent, /Send sign-in link/);
  assert.equal(calls.find((call) => String(call.input).endsWith('/api/auth/start'))?.init?.credentials, 'include');
});

test('generate sends toolId, credentials, and omits blank optional fields', async () => {
  const calls = mockFetch([{ ok: true, body: { status: 'success', output: validOutput } }]);
  await generateEvidence({ topic: ' diabetes prevention ', population: '   ', setting: '' });
  assert.match(String(calls[0]?.input), /\/api\/generate$/);
  assert.equal(calls[0]?.init?.method, 'POST');
  assert.equal(calls[0]?.init?.credentials, 'include');
  assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), {
    toolId: 'evidence-in-practice',
    input: { topic: 'diabetes prevention' },
  });
});

test('successful generation parses body.output only', async () => {
  mockFetch([{ ok: true, body: { status: 'success', output: validOutput } }]);
  const result = await generateEvidence({ topic: 'x', population: '', setting: '' });
  assert.equal(result.kind, 'success');
});

test('insufficient_evidence with valid body.output displays as success', async () => {
  mockFetch([{ ok: true, body: { status: 'insufficient_evidence', output: validOutput } }]);
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

test('source code refreshes /api/me in generation finally, gates sign-in on explicit false auth, and renders PubMed metadata links only', async () => {
  const appSource = await readFile('src/app.ts', 'utf8');
  assert.match(appSource, /finally \{[\s\S]*await refreshMe\(\)/);
  assert.match(appSource, /authenticated === false \|\| state\.usage\?\.verified === false/);
  assert.match(appSource, /Retry account status/);
  assert.match(appSource, /source\.pubmedUrl/);
  assert.doesNotMatch(appSource, /fetch\([^\n]*(pubmed|ncbi)/i);
});
