# Evidence in Practice

Evidence in Practice is a standalone AHEA frontend tool for translating public health and health sciences literature into practical insights, implementation considerations, equity considerations, evidence gaps, and action-oriented takeaways for programs, policy, and practice.

## Tool configuration

- Tool name: Evidence in Practice
- Official `toolId`: `evidence-in-practice`
- Public frontend domain: `https://evidence-in-practice.americanhealthequity.org`
- Shared backend: `https://api.americanhealthequity.org`
- Vercel project: `evidence-in-practice`

## Required environment variable

Create the following environment variable in local development and Vercel:

```bash
NEXT_PUBLIC_AHEA_BACKEND_URL=https://api.americanhealthequity.org
```

Do not add backend secrets to this frontend repository. In particular, do not add OpenAI keys, Supabase service role keys, Upstash Redis tokens, or backend cookie/session secrets.

## Backend dependency and architecture

This repository is UI-only. The shared AHEA backend is the source of truth and must support `toolId: "evidence-in-practice"` before production use.

The frontend calls only these shared backend endpoints:

1. `GET /api/me`
2. `POST /api/auth/start`
3. `POST /api/generate`

All browser fetches to the shared backend use `credentials: "include"`. The frontend does not call OpenAI, PubMed, Supabase, or Redis directly, and it does not retrieve PDFs, scrape literature, enforce access, enforce usage limits, enforce paywall state, or create a tool-specific auth or free-trial system.

## Development

This app is implemented as a dependency-light TypeScript frontend so it can be installed, checked, tested, and built in constrained CI environments without live backend or registry-dependent runtime packages.

```bash
npm install
npm run dev
```

Available checks:

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

`npm run build` emits a static frontend to `dist/`. Tests compile to `dist-test/` and use mocked fetches only; they do not call the live backend, OpenAI, Supabase, or PubMed.

## Deployment notes

1. Create or connect the GitHub repository `ahea-tools/evidence-in-practice` to the Vercel frontend project `evidence-in-practice`.
2. Configure `NEXT_PUBLIC_AHEA_BACKEND_URL=https://api.americanhealthequity.org` in Vercel.
3. Configure the custom domain `https://evidence-in-practice.americanhealthequity.org` for the Vercel project.
4. Set the Vercel build command to `npm run build` and output directory to `dist`.
5. Confirm the shared backend supports the `evidence-in-practice` tool before production traffic is sent to the frontend.
6. Do not add backend secrets to Vercel for this frontend project.
