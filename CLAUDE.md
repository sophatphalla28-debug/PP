# CLAUDE.md

Guidance for AI assistants (and humans) working in this repository.

## What this project is

**KIIP Korean Academy** (package name `kiip-korean-academy`) — a bilingual
(Korean + English) learning website for English-speaking immigrants preparing for
Korea's **KIIP** program (Korea Immigration and Integration Program, 사회통합프로그램),
covering **Levels 0–5**.

It is an **independent educational project**. It is **not** affiliated with the Korean
Ministry of Justice, Socinet, or any government agency, and all practice questions must
be **original** — never copied from real KIIP exams. This constraint drives real content
rules (see [Content rules](#content-rules-non-negotiable)); treat it as a hard
requirement, not a disclaimer.

## Current state of the repository (read this first)

This repo is currently a **fresh Next.js scaffold**. Only configuration files are
committed:

```
.gitignore  README.md  package.json  package-lock.json
next.config.ts  tsconfig.json  vitest.config.ts
eslint.config.mjs  postcss.config.mjs  next-env.d.ts
```

The application source directories described in `README.md` — `app/`, `components/`,
`data/`, `lib/`, `types/`, `tests/` — **do not exist yet**. `README.md` documents the
*intended* architecture and content model; this file records both that plan and the
ground truth so you don't assume code exists when it doesn't. There is no `node_modules/`
checked out (run `npm install` first), and no `CLAUDE.md`-referenced code beyond the
config files.

When you build features, create these directories to match the structure in
[Planned architecture](#planned-architecture-target-structure) rather than inventing a
new layout.

## Tech stack

- **Next.js 16.2** with the **App Router** and **Turbopack**
- **React 19.2** + **TypeScript 5** (`strict: true`)
- **Tailwind CSS v4** — CSS-first `@theme` config (there is **no** `tailwind.config.js`;
  Tailwind is wired through `postcss.config.mjs` via `@tailwindcss/postcss`)
- **Zod 4** for validating persisted data
- **Vitest 4** for unit tests (Node environment)
- **lucide-react** for icons
- Browser **Web Speech API** for Korean text-to-speech
- **localStorage** for all user progress — **no accounts, no server, no database**

## Commands

```bash
npm install        # install dependencies (required first — no node_modules committed)
npm run dev        # dev server with Turbopack → http://localhost:3000
npm run build      # production build
npm start          # serve the production build
npm run lint       # ESLint (eslint-config-next: core-web-vitals + typescript)
npm test           # Vitest unit tests (runs once, non-watch)
```

Node 20+ is expected (`@types/node` is v20).

To run a single test file: `npx vitest run tests/<file>.test.ts`.

## Key conventions & gotchas

- **Import alias:** `@/*` maps to the repo root (`tsconfig.json` and `vitest.config.ts`
  both define it). Import as `@/lib/scoring`, `@/data/lessons`, etc. — not relative
  `../../` chains.
- **Tailwind v4 is CSS-first.** Define theme tokens with `@theme` in a global stylesheet
  (planned: `app/globals.css`). Do not add a `tailwind.config.js` expecting it to be read.
- **Fonts:** Google Fonts / `next/font/google` is intentionally avoided because the build
  environment blocks Google Fonts; the plan uses system font stacks with Korean-aware
  fallbacks (Apple SD Gothic Neo / Malgun Gothic / Noto Sans KR). If you reintroduce
  `next/font/google`, verify the build environment can reach fonts.googleapis.com first.
- **Every route should prerender statically** — no per-request server data. The site is
  static-exportable (`output: "export"` can be added to `next.config.ts`).
- **Persistence is centralized.** All localStorage access must go through `lib/storage.ts`
  (serialize/parse, zod-validated) and the `useProgress()` hook in `lib/progress.ts`.
  Components must **never** touch `localStorage` directly — this keeps a future backend
  migration to a single seam.
- **TTS is centralized** in `lib/tts.ts` + `components/audio/AudioButton.tsx`. To support
  recorded audio, add an optional `audioUrl` and fall back to `speak()`.
- **Accessibility is a requirement, not a nice-to-have:** semantic HTML, `lang="ko"` on
  Korean text, keyboard navigation with visible focus, labeled icon buttons, dark mode
  with sufficient contrast, and `prefers-reduced-motion` respected.
- **SEO:** per-page metadata via the Next Metadata API, generated `sitemap.ts`/`robots.ts`,
  descriptive slugs, and the personal `dashboard/` route excluded from indexing.
- Before deploying, replace the placeholder domain
  `https://kiip-korean-academy.example.com` in `app/layout.tsx` (`metadataBase`),
  `app/sitemap.ts`, and `app/robots.ts`.

## Content rules (non-negotiable)

Content lives as **typed TypeScript data in `data/`** — there is no CMS. Adding data to
`data/` should automatically update nav counts, the search index, sitemap, and practice
pools, so keep those derived from the data rather than hardcoded.

- Practice/quiz questions must be **original** and labeled as practice material — never
  copied from any real exam.
- The placement test must be labeled **unofficial** at both intro and results.
- Facts about the KIIP program itself (fees, hours, benefits) must stay **general** and
  carry a `lastVerified` date; defer specifics to official sources (Socinet, 1345,
  HiKorea). Give **no legal or immigration advice**.
- Keep one speech level per beginner dialogue (polite 요-form unless the lesson teaches
  otherwise). Every Korean sentence needs a natural English translation; add a `literal`
  gloss when word order is instructive. Romanization is discouraged at levels 3+.

### Adding a lesson (planned workflow)

1. Copy an existing lesson object in `data/lessons.ts`; give it a unique `id`, `slug`,
   `level`, `unit`, and `status: "available"`.
2. Reference vocabulary by id (`vocabularyIds`) and grammar by slug (`grammarSlugs`),
   adding new entries to `data/vocabulary.ts` / `data/grammar.ts` first if needed.
3. Fill every section (objectives, warm-up, sentences, dialogue, culture note, activities,
   quiz with `explanation` and `whyWrong`).
4. Run `npm run build` — TypeScript catches missing fields.

Vocabulary/grammar/society articles follow the same append pattern (vocabulary uses a
`v()` helper; society bodies are paragraph arrays where `"## Heading"` and `"- item"`
render structure).

## Planned architecture (target structure)

From `README.md` — create these as you build:

```
app/                    App Router routes (all statically prerendered)
  levels/[level]/       Level 0–5 overviews
  lessons/[slug]/       Lesson pages
  vocabulary/  grammar/[slug]/  society/[slug]/
  placement-test/  practice/  study-planner/  dashboard/  search/
  about-kiip/ about/ resources/ faq/ contact/ legal/[slug]/
  layout.tsx  sitemap.ts  robots.ts  not-found.tsx  globals.css
components/
  layout/  learning/  quizzes/  vocabulary/  dashboard/  common/  audio/
data/                   levels, lessons, vocabulary, grammar, society, faq, placement
lib/                    storage (zod), progress (hook), scoring, planner, search, tts
types/                  shared TypeScript types
tests/                  Vitest unit tests (scoring, planner, storage, search)
```

## Git & workflow

- Development branch for current work: **`claude/claude-md-docs-2oa7br`**. Develop, commit,
  and push there; do not push to `main` without explicit permission.
- Push with `git push -u origin <branch>`.
- Do **not** open a pull request unless explicitly asked.

## When updating this file

Keep it honest about what actually exists. As real source lands under `app/`,
`components/`, `data/`, and `lib/`, move items from
[Planned architecture](#planned-architecture-target-structure) into concrete descriptions,
and correct the [Current state](#current-state-of-the-repository-read-this-first) section
so it never overstates what is present.
