import { fetchMe, generateEvidence, startAuth } from './api.js';
import { AHEA_TOOLS_HUB_URL } from './constants.js';
import { el, replaceChildren } from './dom.js';
import type { EvidenceOutput, GenerationInput, UsageState } from './types.js';

const MAX_TOPIC = 600;
const MAX_FIELD = 160;
const unavailable = (value: unknown): string => (value === undefined || value === null || value === '' ? '—' : String(value));

export type AppState = {
  usage: UsageState | null;
  output: EvidenceOutput | null;
  loading: boolean;
  status: string;
  error: string;
  blocked: UsageState | null;
  authMessage: string;
};

const state: AppState = {
  usage: null,
  output: null,
  loading: false,
  status: '',
  error: '',
  blocked: null,
  authMessage: '',
};

let root: HTMLElement;
let topicInput: HTMLTextAreaElement;
let populationInput: HTMLInputElement;
let settingInput: HTMLInputElement;
let emailInput: HTMLInputElement;

export function createToolHubLink(): HTMLAnchorElement {
  return el('a', { class: 'toolHubLink', href: AHEA_TOOLS_HUB_URL }, ['← Return to AHEA Tools']);
}

function usagePanel(usage: UsageState | null): HTMLElement {
  const authCopy = usage?.authenticated === false || usage?.verified === false ? 'Authentication required.' : 'Access information.';
  return el('section', { class: 'accessNotice', 'aria-label': 'AHEA access and usage status' }, [
    el('p', {}, [authCopy]),
    el('p', {}, [
      `Generations used: ${unavailable(usage?.generationsUsed)} • Free limit: ${unavailable(usage?.freeGenerationsLimit)} • Remaining free generations: ${unavailable(usage?.remainingFreeGenerations)} • Access status: ${unavailable(usage?.accessStatus)}.`,
    ]),
    el('p', { class: 'quietCopy' }, ['Verified users receive 2 complimentary generations total across all AHEA tools.']),
  ]);
}

function authPanel(needsAuth: boolean): HTMLElement | null {
  if (!needsAuth) return null;
  emailInput = el('input', { id: 'email', type: 'email', required: true, placeholder: 'you@example.org' }) as HTMLInputElement;
  return el('section', { class: 'authBox' }, [
    el('p', {}, ['Please sign in or verify your email to use AHEA tools. The shared AHEA backend verifies identity and determines generation access.']),
    el('form', { onsubmit: onAuthSubmit }, [
      el('label', { for: 'email' }, ['Email address']),
      emailInput,
      el('button', { class: 'secondaryButton', type: 'submit', disabled: state.loading }, [state.loading ? 'Sending…' : 'Send sign-in link']),
    ]),
    state.authMessage ? el('p', { role: 'status' }, [state.authMessage]) : null,
  ]);
}

async function onAuthSubmit(event: Event): Promise<void> {
  event.preventDefault();
  state.loading = true;
  state.authMessage = '';
  render();
  const result = await startAuth(emailInput.value.trim());
  state.authMessage = result.message ?? (result.ok ? 'Check your email for the secure sign-in link.' : 'We could not start sign-in. Please try again in a moment.');
  state.loading = false;
  render();
}

function listSection(title: string, items: string[]): HTMLElement {
  return el('section', { class: 'resultSection' }, [
    el('h3', {}, [title]),
    el('ul', {}, items.map((item) => el('li', {}, [item]))),
  ]);
}

function results(output: EvidenceOutput | null): HTMLElement | null {
  if (!output) return null;

  return el('article', { class: 'results' }, [
    el('section', { class: 'resultSection' }, [el('h2', {}, ['Evidence Snapshot']), el('p', {}, [output.evidenceSnapshot])]),
    listSection('Key Takeaways', output.keyTakeaways),
    listSection('What Appears Most Effective', output.whatAppearsMostEffective),
    listSection('Context and Applicability', output.contextAndApplicability),
    listSection('Equity Considerations', output.equityConsiderations),
    listSection('Practice Considerations', output.practiceConsiderations),
    listSection('Evidence Gaps and Unanswered Questions', output.evidenceGapsAndUnansweredQuestions),
    el('section', { class: 'resultSection' }, [
      el('h3', {}, ['Sources Reviewed']),
      el('div', { class: 'sources' }, output.sourcesReviewed.map((source) => el('div', { class: 'source' }, [
        el('h4', {}, [source.title]),
        el('p', {}, [`${source.journal} · ${source.year} · PMID: ${source.pmid}`]),
        el('a', { href: source.pubmedUrl, target: '_blank', rel: 'noopener noreferrer' }, ['View on PubMed']),
      ]))),
    ]),
  ]);
}

function inputForm(): HTMLElement {
  topicInput = el('textarea', { id: 'topic', maxlength: MAX_TOPIC, required: true }) as HTMLTextAreaElement;
  populationInput = el('input', { id: 'population', maxlength: MAX_FIELD }) as HTMLInputElement;
  settingInput = el('input', { id: 'setting', maxlength: MAX_FIELD }) as HTMLInputElement;

  return el('section', { class: 'panel formPanel' }, [
    usagePanel(state.usage),
    authPanel(state.usage?.authenticated === false || state.usage?.verified === false),
    el('h2', {}, ['Generate a practice brief']),
    el('form', { class: 'toolForm', onsubmit: onGenerateSubmit }, [
      el('label', { for: 'topic' }, ['Topic or evidence question']),
      el('p', { class: 'helper' }, ['Describe the public health or health sciences topic you want to explore.']),
      topicInput,
      el('label', { for: 'population' }, ['Population, community, or group, optional']),
      el('p', { class: 'helper' }, ['Optional. Add a population or community if relevant.']),
      populationInput,
      el('label', { for: 'setting' }, ['Setting or context, optional']),
      el('p', { class: 'helper' }, ['Optional. Add a setting such as schools, clinics, community programs, public health agencies, or policy environments.']),
      settingInput,
      el('button', { class: 'primary', type: 'submit', disabled: state.loading }, [state.loading ? 'Generating…' : 'Generate Evidence in Practice Brief']),
    ]),
    el('div', { class: 'status', 'aria-live': 'polite' }, [state.status]),
    state.error ? el('p', { role: 'alert', class: 'error' }, [state.error]) : null,
    state.blocked ? blockedPanel(state.blocked) : null,
  ]);
}

function receivePanel(): HTMLElement {
  return el('section', { class: 'panel receivePanel' }, [
    el('p', {}, ['You will receive: Evidence Snapshot, Key Takeaways, What Appears Most Effective, Context and Applicability, Equity Considerations, Practice Considerations, Evidence Gaps and Unanswered Questions, and Sources Reviewed.']),
  ]);
}

function blockedPanel(blocked: UsageState): HTMLElement {
  return el('div', { class: 'blocked' }, [
    el('p', {}, [blocked.message ?? 'You’ve used your two complimentary AHEA tool generations. Membership unlocks continued access across all AHEA tools.']),
    blocked.paywallUrl ? el('a', { href: blocked.paywallUrl }, ['Membership access']) : null,
  ]);
}

export function validateInput(input: GenerationInput): string | null {
  if (!input.topic) return 'Please enter a public health or health sciences topic before generating a brief.';
  if (input.topic.length > MAX_TOPIC || input.population.length > MAX_FIELD || input.setting.length > MAX_FIELD) return 'Please shorten the fields before submitting.';
  return null;
}

async function refreshMe(): Promise<void> {
  try {
    state.usage = await fetchMe();
  } catch {
    state.usage = null;
  }
}

async function onGenerateSubmit(event: Event): Promise<void> {
  event.preventDefault();
  state.error = '';
  state.status = '';
  state.blocked = null;

  const input = {
    topic: topicInput.value.trim(),
    population: populationInput.value.trim(),
    setting: settingInput.value.trim(),
  };
  const validationError = validateInput(input);
  if (validationError) {
    state.error = validationError;
    render();
    return;
  }

  state.loading = true;
  state.status = 'Reviewing available evidence and preparing a practice-oriented synthesis…';
  render();

  try {
    const result = await generateEvidence(input);
    if (result.kind === 'success') {
      state.output = result.output;
      state.usage = result.usage;
      state.status = 'Evidence in Practice brief generated.';
    } else {
      state.error = result.message;
      if (result.kind === 'blocked') state.blocked = result.usage;
    }
  } catch {
    state.error = 'We couldn’t complete this request. Please try again in a moment.';
  } finally {
    state.loading = false;
    await refreshMe();
    render();
  }
}

export function render(): void {
  replaceChildren(root, [
    el('main', { class: 'shell' }, [
      el('header', {}, [
        el('p', { class: 'eyebrow' }, ['AMERICAN HEALTH EQUITY ASSOCIATION']),
        el('h1', {}, ['Evidence in Practice']),
        el('p', { class: 'lede' }, ['Translate public health and health sciences literature into practical insights, equity considerations, implementation guidance, evidence gaps, and action-oriented takeaways for programs, policy, and practice.']),
      ]),
      el('div', { class: 'terracottaRule', 'aria-hidden': 'true' }, []),
      el('div', { class: 'workspace' }, [
        el('div', { class: 'mainRail' }, [
          inputForm(),
        ]),
        el('aside', { class: 'sideRail' }, [
          receivePanel(),
          results(state.output),
        ]),
      ]),
      createToolHubLink(),
    ]),
  ]);
}

export async function mount(target: HTMLElement): Promise<void> {
  root = target;
  await refreshMe();
  render();
}
