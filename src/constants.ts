export const TOOL_ID = 'evidence-in-practice';
export const AHEA_TOOLS_HUB_URL = 'https://americanhealthequity.org/tools';
export const DEFAULT_BACKEND_URL = 'https://api.americanhealthequity.org';

declare global {
  interface ImportMeta {
    readonly env?: Record<string, string | undefined>;
  }
}

const env = import.meta.env ?? {};

export const BACKEND_URL =
  env.NEXT_PUBLIC_AHEA_BACKEND_URL ??
  env.VITE_AHEA_BACKEND_URL ??
  DEFAULT_BACKEND_URL;
