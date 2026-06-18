export type SourceReviewed = {
  title: string;
  year: string | number;
  journal: string;
  pmid: string;
  pubmedUrl: string;
};

export type EvidenceOutput = {
  evidenceSnapshot: string;
  keyTakeaways: string[];
  whatAppearsMostEffective: string[];
  contextAndApplicability: string[];
  equityConsiderations: string[];
  practiceConsiderations: string[];
  evidenceGapsAndUnansweredQuestions: string[];
  sourcesReviewed: SourceReviewed[];
};

export type UsageState = {
  generationsUsed?: number | string;
  freeGenerationsLimit?: number | string;
  remainingFreeGenerations?: number | string;
  accessStatus?: string;
  message?: string;
  paywallUrl?: string;
  blocked?: boolean;
  authenticated?: boolean;
  verified?: boolean;
};

export type GenerationInput = {
  topic: string;
  population: string;
  setting: string;
};
