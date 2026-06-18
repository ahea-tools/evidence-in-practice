import type { EvidenceOutput, SourceReviewed } from './types.js';

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === 'string');
const isSource = (value: unknown): value is SourceReviewed =>
  isRecord(value) &&
  typeof value.title === 'string' &&
  (typeof value.year === 'string' || typeof value.year === 'number') &&
  typeof value.journal === 'string' &&
  typeof value.pmid === 'string' &&
  typeof value.pubmedUrl === 'string';

export function isEvidenceOutput(value: unknown): value is EvidenceOutput {
  return (
    isRecord(value) &&
    typeof value.evidenceSnapshot === 'string' &&
    isStringArray(value.keyTakeaways) &&
    isStringArray(value.whatAppearsMostEffective) &&
    isStringArray(value.contextAndApplicability) &&
    isStringArray(value.equityConsiderations) &&
    isStringArray(value.practiceConsiderations) &&
    isStringArray(value.evidenceGapsAndUnansweredQuestions) &&
    Array.isArray(value.sourcesReviewed) &&
    value.sourcesReviewed.every(isSource)
  );
}
