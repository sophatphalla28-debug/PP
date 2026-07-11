# KIIP Korean Academy

A complete, bilingual (Korean + English) learning website for English-speaking immigrants
preparing for Korea's **KIIP** program (Korea Immigration and Integration Program,
사회통합프로그램), covering **Levels 0–5**.

> **Important:** This is an independent educational project. It is **not affiliated with the
> Korean Ministry of Justice, Socinet, or any Korean government agency**. All practice
> questions are original — none are official KIIP examination questions.

---

## Tech stack

- **Next.js 16** (App Router, Turbopack) + **TypeScript**
- **Tailwind CSS v4** (CSS-first `@theme` configuration in `app/globals.css`)
- **Zod** for validating persisted data
- **Vitest** for unit tests
- **lucide-react** for icons
- Browser **Web Speech API** for Korean text-to-speech (swappable — see below)
- **localStorage** for all user progress (no accounts, no server)

## Getting started

```bash
npm install
npm run dev       # http://localhost:3000
npm run build     # production build (all pages prerender statically)
npm start         # serve the production build
npm run lint      # ESLint
npm test          # Vitest unit tests (scoring, planner, storage, search)
```

Node 20+ recommended.

## Deploying

**Vercel (easiest):** push the repo to GitHub, import it in Vercel, accept the defaults.
No environment variables are required. Before going live, replace the placeholder domain
`https://kiip-korean-academy.example.com` in:

- `app/layout.tsx` (`metadataBase`)
- `app/sitemap.ts`
- `app/robots.ts`

**Any Node host:** `npm run build && npm start`. The site is also fully static-exportable
if you prefer (`output: "export"` in `next.config.ts`) since every route prerenders.

---

## Project structure

```
app/                    Routes (App Router)
  page.tsx              Home (thin wrapper around app/home-page.tsx)
  levels/[level]/       Level 0–5 overviews
  lessons/[slug]/       Full lesson pages
  vocabulary/           Vocabulary browser + flashcards
  grammar/[slug]/       Grammar library and detail pages
  society/[slug]/       Korean society library (Level 5 support)
  placement-test/       40-question unofficial diagnostic
  practice/             Mixed practice sessions (practice/test mode)
  study-planner/        Honest weekly plan generator
  dashboard/            Local progress dashboard with charts
  search/               Site-wide search
  about-kiip/ about/ resources/ faq/ contact/
  legal/[slug]/         privacy, terms, disclaimer, accessibility
  sitemap.ts robots.ts not-found.tsx
components/
  layout/    Header (nav, dark mode), Footer (+ mobile bottom nav)
  learning/  LessonView, KoreanLine/DialogueView, LessonLibrary
  quizzes/   QuizRunner, PlacementTest, PracticeHub
  vocabulary/ VocabBrowser, Flashcards
  dashboard/ Dashboard, StudyPlanner, MiniBarChart
  common/    Breadcrumbs, Notices (disclaimers/badges), SearchClient
  audio/     AudioButton (TTS)
data/        All content: levels, lessons, vocabulary, grammar, society, faq, placement
lib/         storage (zod-validated localStorage), progress (React hook),
             scoring, planner, search, tts
types/       Shared TypeScript types
tests/       Vitest unit tests
```

---

## Content management

All content is typed TypeScript data — no CMS needed. To add content, edit the files in
`data/` and the site (nav counts, search index, sitemap, practice pools) updates automatically.

### Adding a lesson

1. Open `data/lessons.ts` and copy an existing lesson object.
2. Give it a unique `id`, `slug`, `level`, and `unit`, and set `status: "available"`.
3. Reference vocabulary by id (`vocabularyIds`) and grammar by slug (`grammarSlugs`) —
   add new entries to `data/vocabulary.ts` / `data/grammar.ts` first if needed.
4. Fill every section: objectives, warm-up, sentences (`ko`, `romanization`, `en`, optional
   `literal`), dialogue, culture note, activities, and quiz questions (each with an
   `explanation`, and `whyWrong` where useful).
5. Run `npm run build` — TypeScript will catch missing fields.

Content conventions:

- Keep one speech level per beginner dialogue (polite 요-form unless the lesson teaches otherwise).
- Every Korean sentence needs a natural English translation; add `literal` when the
  word-order insight helps.
- Quiz questions must be original and labeled scenarios, never copied from any real exam.
- Facts about the KIIP program itself must stay general and carry a `lastVerified` date.

### Adding vocabulary / grammar / society articles

Same pattern: append to `data/vocabulary.ts` (use the `v()` helper), `data/grammar.ts`, or
`data/society.ts`. Society article bodies are paragraph arrays; `"## Heading"` renders a
heading and `"- item"` a list item.

### Replacing browser TTS with recorded audio

All audio flows through `lib/tts.ts` and `components/audio/AudioButton.tsx`. To use recorded
files: add an optional `audioUrl` field to sentences/vocabulary, and in `AudioButton` play the
file when present, falling back to `speak()` otherwise. Nothing else needs to change.

### Migrating progress to a backend (e.g. Supabase)

All persistence goes through two files: `lib/storage.ts` (serialize/parse) and
`lib/progress.ts` (the `useProgress()` hook). Replace the load/save functions with API calls,
keep the zod schema as your payload validator, and every component keeps working — components
never touch localStorage directly.

---

## Design decisions & deviations

- **Forms:** simple controlled components instead of `react-hook-form` — the forms here are
  small and this keeps the dependency tree lean.
- **Charts:** a small dependency-free SVG bar chart (`MiniBarChart`) instead of a chart
  library — accessible (aria labels), tiny, and sufficient for the dashboard.
- **Fonts:** system font stacks (with Korean-aware fallbacks like Apple SD Gothic Neo /
  Malgun Gothic / Noto Sans KR when installed) instead of `next/font/google`, because the
  build environment blocks Google Fonts. To use hosted Noto Sans KR, add `next/font/google`
  back in `app/layout.tsx`.
- **Demo scale:** the architecture supports the full curriculum, and 8 complete lessons,
  151 vocabulary entries, 18 grammar points, 12 society articles, and 40 placement questions
  are included as production-quality seed content. Lessons marked "coming soon" show the
  planned curriculum without dead links.

## Accuracy & safety checklist (all implemented)

- [x] Prominent independence disclaimer in footer, home, society, resources, legal pages
- [x] "Last verified" dates on changeable official facts (About KIIP, FAQ, resources, society)
- [x] Every quiz labeled as original practice material, never official exam content
- [x] Placement test labeled unofficial at intro **and** results
- [x] No legal/immigration advice; users pointed to official channels (Socinet, 1345, HiKorea)
- [x] No fixed claims about fees, hours, or benefit rules — those defer to official sources
- [x] TTS imperfection notice on listening activities
- [x] Study planner is honest about unrealistic timelines and makes no guarantees

## Accessibility checklist (all implemented)

- [x] Semantic HTML, landmarks, heading hierarchy, skip-to-content link
- [x] Keyboard navigable; visible focus states; `aria-pressed` on toggles
- [x] `lang="ko"` on all Korean text for correct screen-reader pronunciation
- [x] Labels on icon buttons, audio controls, progress bars (role="progressbar")
- [x] Dark mode with sufficient contrast; meaning never by color alone
- [x] `prefers-reduced-motion` respected

## SEO checklist (all implemented)

- [x] Per-page titles/descriptions via the Metadata API, Open Graph tags
- [x] `sitemap.xml` and `robots.txt` generated from real content
- [x] Descriptive URLs (`/lessons/hangul-vowels-consonants`), breadcrumbs on every page
- [x] Dashboard excluded from indexing (personal page)

## Feature checklist

- [x] Home with hero, level paths, daily word/grammar/tip, featured lessons, FAQ, newsletter
- [x] Levels 0–5 overview + per-level pages
- [x] 8 full lessons: objectives, warm-up, vocab with audio, grammar, sentences (Korean /
      romanization / natural / literal with per-user toggles; romanization discouraged at
      levels 3+), dialogue, culture note, 4-skill activities, quiz, flashcards, notes,
      completion, prev/next
- [x] Vocabulary browser: search, level/topic/pos/status filters, favorites, spaced review
      (new → learning → review → mastered), 4 flashcard modes
- [x] Grammar library with comparisons, formation/usage/mistakes, examples, mini quizzes
- [x] Society library: 12 articles with key terms and audio
- [x] 40-question progressive placement test with section scores and honest recommendation
- [x] Mixed practice with practice/test modes and full explanations
- [x] Study planner with realistic-check
- [x] Dashboard: streak, weekly goal, 4 charts, weak-area detection, bookmarks, notes, reset
- [x] Site-wide search with type/level filters and highlighting
- [x] Dark mode, mobile bottom nav, custom 404, unit tests (24 passing)

## Future improvements

- More lessons per level (structure is in place; "coming soon" units are already outlined)
- Recorded native-speaker audio and listening comprehension with real audio clips
- Handwriting/stroke-order practice for Hangul
- Optional accounts with cloud sync (see migration notes above)
- Community features (study groups, Q&A) with moderation
- Korean UI translation toggle for the site chrome itself
