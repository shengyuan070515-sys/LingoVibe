# Reading & Wordbank Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship three incremental reading/word-bank improvements — per-word memory accuracy, in-body key term highlighting (phrases + keyVocab + saved words with linked interactions), and a responsive selection insight panel (翻译/语法) that replaces the rigid above-article cards.

**Architecture:** Pure logic lives in `src/lib/*` with `.test.ts` tests. React components stay untested (project has no component-test infra — covered by `tsc`/`eslint`/manual QA). Backend (`api/_lib/reading-article-generate.ts`) gains one new optional field (`keyPhrases`) that flows through existing API types and the zustand reading store into the page. The in-body highlighter is a recursive React children transformer that runs on text nodes emitted by `react-markdown`, preserving all markdown structure.

**Tech Stack:** React 18, TypeScript, zustand + persist, `react-markdown` + `remark-gfm`, Tailwind CSS, `lucide-react`, `vitest` (node env), DeepSeek via existing `/api/reading-generate` endpoint.

**Spec:** `docs/superpowers/specs/2026-04-17-reading-and-wordbank-enhancements-design.md`

**Commit style:** small, frequent; prefer `feat:` / `refactor:` / `test:` / `fix:` prefixes; each task below ends in at least one commit.

**Shell note (PowerShell):** chain commands with `;` not `&&`. Wrap multi-line commit messages in `git commit -m "$(cat <<'EOF' ... EOF)"` equivalents, e.g. use `git commit -F <tmpfile>` or a single `-m`.

---

## Task 1: `computeWordAccuracy` pure function + tests

**Files:**
- Create: `src/lib/word-stats.ts`
- Create: `src/lib/word-stats.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/word-stats.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { ReviewLogEntry } from '@/store/reviewLogStore';
import { computeWordAccuracy } from './word-stats';

function entry(partial: Partial<ReviewLogEntry>): ReviewLogEntry {
    return {
        at: partial.at ?? Date.now(),
        wordId: partial.wordId ?? 'w1',
        word: partial.word ?? 'apple',
        outcome: partial.outcome ?? 'know',
        levelBefore: partial.levelBefore ?? 0,
        levelAfter: partial.levelAfter ?? 1,
    };
}

describe('computeWordAccuracy', () => {
    it('returns totalReviews=0 and rate=null when no entries match the wordId', () => {
        const r = computeWordAccuracy([], 'w1');
        expect(r).toEqual({ rate: null, totalReviews: 0, countedReviews: 0 });
    });

    it('filters entries by wordId', () => {
        const r = computeWordAccuracy(
            [
                entry({ wordId: 'w1', outcome: 'know' }),
                entry({ wordId: 'w2', outcome: 'forgot' }),
            ],
            'w1',
        );
        expect(r.totalReviews).toBe(1);
        expect(r.countedReviews).toBe(1);
        expect(r.rate).toBe(1);
    });

    it('excludes `learning` outcomes from both numerator and denominator but counts them in totalReviews', () => {
        const r = computeWordAccuracy(
            [
                entry({ wordId: 'w1', outcome: 'know' }),
                entry({ wordId: 'w1', outcome: 'know' }),
                entry({ wordId: 'w1', outcome: 'forgot' }),
                entry({ wordId: 'w1', outcome: 'learning' }),
                entry({ wordId: 'w1', outcome: 'learning' }),
            ],
            'w1',
        );
        expect(r.totalReviews).toBe(5);
        expect(r.countedReviews).toBe(3);
        expect(r.rate).toBeCloseTo(2 / 3, 5);
    });

    it('returns rate=null when countedReviews < 3 (threshold), even if totalReviews >= 3', () => {
        const r = computeWordAccuracy(
            [
                entry({ wordId: 'w1', outcome: 'know' }),
                entry({ wordId: 'w1', outcome: 'learning' }),
                entry({ wordId: 'w1', outcome: 'learning' }),
            ],
            'w1',
        );
        expect(r.totalReviews).toBe(3);
        expect(r.countedReviews).toBe(1);
        expect(r.rate).toBeNull();
    });

    it('returns rate=1 for three straight knows', () => {
        const r = computeWordAccuracy(
            [
                entry({ wordId: 'w1', outcome: 'know' }),
                entry({ wordId: 'w1', outcome: 'know' }),
                entry({ wordId: 'w1', outcome: 'know' }),
            ],
            'w1',
        );
        expect(r.rate).toBe(1);
        expect(r.countedReviews).toBe(3);
    });

    it('returns rate=0 for three straight forgots', () => {
        const r = computeWordAccuracy(
            [
                entry({ wordId: 'w1', outcome: 'forgot' }),
                entry({ wordId: 'w1', outcome: 'forgot' }),
                entry({ wordId: 'w1', outcome: 'forgot' }),
            ],
            'w1',
        );
        expect(r.rate).toBe(0);
        expect(r.countedReviews).toBe(3);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/word-stats.test.ts`
Expected: FAIL — module `./word-stats` not found.

- [ ] **Step 3: Write the implementation**

Create `src/lib/word-stats.ts`:

```ts
import type { ReviewLogEntry } from '@/store/reviewLogStore';

export interface WordAccuracyResult {
    /** Lifetime accuracy in [0, 1], or null when countedReviews < 3. */
    rate: number | null;
    /** know + forgot + learning — what the UI shows next to the % as "N 次". */
    totalReviews: number;
    /** know + forgot — the denominator that drives `rate` and its threshold. */
    countedReviews: number;
}

const MIN_COUNTED_REVIEWS = 3;

/**
 * Compute a word's lifetime review accuracy from the review log.
 *
 * - `learning` outcomes are excluded from both numerator and denominator
 *   (they're self-reported "still working on it" and shouldn't move the rate).
 * - The percentage is only revealed once `countedReviews >= 3` to avoid
 *   noisy 0%/100% readings after a single review.
 */
export function computeWordAccuracy(
    entries: ReviewLogEntry[],
    wordId: string,
): WordAccuracyResult {
    let totalReviews = 0;
    let countedReviews = 0;
    let knowCount = 0;
    for (const e of entries) {
        if (e.wordId !== wordId) continue;
        totalReviews += 1;
        if (e.outcome === 'know') {
            countedReviews += 1;
            knowCount += 1;
        } else if (e.outcome === 'forgot') {
            countedReviews += 1;
        }
        // `learning` contributes only to totalReviews.
    }
    const rate =
        countedReviews >= MIN_COUNTED_REVIEWS ? knowCount / countedReviews : null;
    return { rate, totalReviews, countedReviews };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/lib/word-stats.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/word-stats.ts src/lib/word-stats.test.ts
git commit -m "feat(word-stats): add computeWordAccuracy with lifetime + threshold logic"
```

---

## Task 2: Accuracy badge on word-bank card

**Files:**
- Modify: `src/pages/WordBank.tsx` (replace the existing "复习：0" placeholder in the card corner)

**Context for the implementer:** In the current `WordBank.tsx` card body, the top-right corner has hard-coded `复习：0` text displayed inside the card header (inline strings near the word title). Grep for `复习` to find all occurrences. Only items with `type === 'word'` get the accuracy badge. Sentences keep the existing placeholder (or simply render nothing — sentences don't have SRS flow).

- [ ] **Step 1: Confirm current placeholder locations**

Run: `rg "复习[:：]" src/pages/WordBank.tsx` — expect to see the existing placeholder text(s) in the card header. If none are found, the current visual "复习：0" from the screenshot may actually live in a sub-component; check `src/components/reading/visual-dictionary-card-body.tsx` and `src/components/word-detail-modal.tsx` as well.

- [ ] **Step 2: Import the new helpers**

Near the top of `src/pages/WordBank.tsx`, add:

```tsx
import { computeWordAccuracy } from '@/lib/word-stats';
import { useReviewLogStore } from '@/store/reviewLogStore';
```

- [ ] **Step 3: Subscribe to the review log**

Inside `WordBankPage`, after the existing `const { words, ... } = useWordBankStore();` line, add:

```tsx
const reviewEntries = useReviewLogStore((s) => s.entries);
```

- [ ] **Step 4: Add a small badge component in the same file**

Add above the `WordBankPage` component:

```tsx
function AccuracyBadge({
    totalReviews,
    countedReviews,
    rate,
    onImage,
}: {
    totalReviews: number;
    countedReviews: number;
    rate: number | null;
    onImage: boolean;
}) {
    if (totalReviews === 0) {
        return (
            <span
                className={cn(
                    'text-[11px] font-medium tabular-nums',
                    onImage ? 'text-white/85' : 'text-slate-400',
                )}
                style={onImage ? { textShadow: '0 1px 4px rgba(0,0,0,0.5)' } : undefined}
            >
                未复习
            </span>
        );
    }
    if (rate === null) {
        return (
            <span
                className={cn(
                    'text-[11px] font-medium tabular-nums',
                    onImage ? 'text-white/90' : 'text-slate-500',
                )}
                style={onImage ? { textShadow: '0 1px 4px rgba(0,0,0,0.5)' } : undefined}
                title={`已复习 ${countedReviews} 次（满 3 次后显示正确率）`}
            >
                复习 {totalReviews} 次
            </span>
        );
    }
    const pct = Math.round(rate * 100);
    const tone = pct >= 80 ? 'ok' : pct >= 50 ? 'warn' : 'bad';
    return (
        <span
            className={cn(
                'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-medium tabular-nums',
                onImage
                    ? 'bg-black/35 text-white'
                    : tone === 'ok'
                      ? 'bg-emerald-50 text-emerald-700'
                      : tone === 'warn'
                        ? 'bg-amber-50 text-amber-700'
                        : 'bg-rose-50 text-rose-700',
            )}
            style={onImage ? { textShadow: '0 1px 4px rgba(0,0,0,0.5)' } : undefined}
            title={`正确率 ${pct}% · 共复习 ${totalReviews} 次`}
        >
            ✓ {pct}% · {totalReviews}次
        </span>
    );
}
```

- [ ] **Step 5: Render the badge inside each card header**

In the card map body, locate the flex row that currently holds `<h3>{item.word}</h3>` and its sibling controls (around the `mb-2 flex items-start justify-between` row). Replace any existing `复习：N` placeholder text with:

```tsx
{item.type === 'word' ? (
    (() => {
        const { rate, totalReviews, countedReviews } = computeWordAccuracy(
            reviewEntries,
            item.id,
        );
        return (
            <AccuracyBadge
                rate={rate}
                totalReviews={totalReviews}
                countedReviews={countedReviews}
                onImage={onImage}
            />
        );
    })()
) : null}
```

Place this inside the existing action-button row (the one with `Volume2` / `Pencil` / `Trash2`), just before the buttons, so it sits in the upper-right block the screenshots show.

- [ ] **Step 6: Verify types and lint**

Run:

```bash
npm run lint
npx tsc --noEmit
```

Expected: both clean. If tsc complains about `onImage` being undefined in the jsx closure, pull the IIFE result into a variable computed just above the `<Button>` row where `onImage` is already in scope.

- [ ] **Step 7: Manual QA note (defer until Task 3 too)**

Open `/wordbank`, add a fresh word, then simulate three reviews in devtools:

```js
useReviewLogStore.getState().push({ wordId: '<id>', word: '<w>', outcome: 'know', levelBefore: 0, levelAfter: 1 });
// repeat for forgot / learning mixes
```

Expect card badge to transition `未复习 → 复习 N 次 → ✓ NN% · Mn次` once `countedReviews >= 3`.

- [ ] **Step 8: Commit**

```bash
git add src/pages/WordBank.tsx
git commit -m "feat(wordbank): show lifetime accuracy badge on word cards"
```

---

## Task 3: Review history section in `WordDetailModal`

**Files:**
- Modify: `src/components/word-detail-modal.tsx`

- [ ] **Step 1: Add imports at the top of the file**

```tsx
import { computeWordAccuracy } from '@/lib/word-stats';
import { useReviewLogStore } from '@/store/reviewLogStore';
```

- [ ] **Step 2: Pull latest entries for this word inside the component**

Near the top of `WordDetailModal` (after the existing hooks), add:

```tsx
const allEntries = useReviewLogStore((s) => s.entries);
const wordEntries = React.useMemo(
    () => allEntries.filter((e) => e.wordId === word.id).slice(0, 10),
    [allEntries, word.id],
);
const accuracy = React.useMemo(
    () => computeWordAccuracy(allEntries, word.id),
    [allEntries, word.id],
);
```

- [ ] **Step 3: Render the history block**

Inside the existing inner `<div className="relative z-20 -mt-px bg-white p-8 pt-8">` container, **after** the existing body (the `isEditing ? ... : <VisualDictionaryCardBody ... />` block) and **before** the "底部操作区" action row, insert:

```tsx
{word.type === 'word' && !isEditing && (
    <section className="mt-6 border-t border-slate-100 pt-5">
        <header className="mb-2 flex items-baseline justify-between">
            <h3 className="text-sm font-semibold text-slate-700">最近复习</h3>
            <span className="text-[11px] text-slate-500 tabular-nums">
                {accuracy.rate !== null
                    ? `正确率 ${Math.round(accuracy.rate * 100)}% · 共 ${accuracy.totalReviews} 次`
                    : accuracy.totalReviews > 0
                      ? `共 ${accuracy.totalReviews} 次（不足 3 次，暂不显示正确率）`
                      : '还没有复习记录'}
            </span>
        </header>
        {wordEntries.length === 0 ? (
            <p className="text-xs text-slate-400">到生词本点「闪卡复习」开始记录吧。</p>
        ) : (
            <ul className="space-y-1">
                {wordEntries.map((e) => (
                    <li
                        key={`${e.at}-${e.wordId}`}
                        className="flex items-center justify-between text-xs text-slate-600"
                    >
                        <span
                            className={
                                e.outcome === 'know'
                                    ? 'font-medium text-emerald-700'
                                    : e.outcome === 'forgot'
                                      ? 'font-medium text-rose-700'
                                      : 'font-medium text-amber-700'
                            }
                        >
                            {e.outcome === 'know'
                                ? '✓ 记得'
                                : e.outcome === 'forgot'
                                  ? '✗ 忘记'
                                  : '… 学习中'}
                        </span>
                        <time className="tabular-nums text-slate-400">
                            {new Date(e.at).toLocaleString('zh-CN', {
                                month: '2-digit',
                                day: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit',
                            })}
                        </time>
                    </li>
                ))}
            </ul>
        )}
    </section>
)}
```

- [ ] **Step 4: Verify types and lint**

```bash
npm run lint
npx tsc --noEmit
```

Both must pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/word-detail-modal.tsx
git commit -m "feat(word-detail): show recent reviews and accuracy summary"
```

---

## Task 4: Backend — produce `keyPhrases` in both prompt paths

**Files:**
- Modify: `api/_lib/reading-article-generate.ts`

**Context:** There are **two** prompt builders (`buildCorePrompt` for the dictionary-driven v2 path and `buildLegacyPrompt` for the AI-self-picks path), each with its own parser (`parseCoreJson`, `parseLegacyJson`). Both paths return objects that eventually feed `AiGeneratedArticle`. We add `keyPhrases: string[]` to the shared result type, the schemas in each prompt, and both parsers.

- [ ] **Step 1: Extend `AiGeneratedArticle` type**

Near the top of `api/_lib/reading-article-generate.ts`, update the interface:

```ts
export interface AiGeneratedArticle {
    title: string;
    body: string;
    difficulty: AiDifficulty;
    summary: string;
    keyVocabulary: AiVocabItem[];
    /** 3–5 固定短语/搭配，正文中逐字出现。可能为空数组（降级时）。 */
    keyPhrases: string[];
    quiz: AiQuizItem[];
}
```

Also extend `ArticleCore`:

```ts
interface ArticleCore {
    title: string;
    body: string;
    summary: string;
    quiz: AiQuizItem[];
    keyPhrases: string[];
}
```

- [ ] **Step 2: Update `buildCorePrompt` system prompt**

Locate the `system` array in `buildCorePrompt`. Inside the JSON schema block, add a `"keyPhrases"` line after `"summary"`:

```ts
'  "summary": string,                // One-sentence Chinese summary (不超过 40 字)',
'  "keyPhrases": [string],           // 3-5 fixed phrases or collocations that appear verbatim in the body (preserve original casing)',
'  "quiz": [                         // exactly 2 comprehension questions',
```

And in the Rules list, add:

```ts
'- Produce 3-5 keyPhrases. Each MUST appear verbatim (same casing) somewhere in the body.',
'- keyPhrases should be multi-word collocations (2-5 words each), NOT single words. Example: "climate change", "make up for", "on the verge of".',
```

- [ ] **Step 3: Update `parseCoreJson` to parse and validate phrases**

At the end of the function (before `return`), add:

```ts
const phrasesRaw = Array.isArray(obj.keyPhrases) ? obj.keyPhrases : [];
const keyPhrases = phrasesRaw
    .map((p) => asString(p))
    .filter((p) => p.length > 0 && p.length <= 80)
    .filter((p) => body.toLowerCase().includes(p.toLowerCase()))
    .slice(0, 5);
```

Change the return to include it:

```ts
return { title, body, summary, quiz, keyPhrases };
```

- [ ] **Step 4: Update `buildLegacyPrompt` schema & rules**

Same schema change (insert `"keyPhrases": [string]` after `"summary"` in the JSON schema block), same rule additions. Both blocks live inside `buildLegacyPrompt`.

- [ ] **Step 5: Update `parseLegacyJson` to parse and validate phrases**

Mirror the parsing from Step 3 — same `phrasesRaw` → filter → `.slice(0, 5)` block — and add to the return:

```ts
return { title, body, difficulty, summary, keyVocabulary, keyPhrases, quiz };
```

- [ ] **Step 6: Propagate through `generateViaDict`**

Locate `generateViaDict` in the same file. Its final `return` composes `AiGeneratedArticle` from `core` and `examples`. Add `keyPhrases: core.keyPhrases` to that return object.

- [ ] **Step 7: Lint & type check**

```bash
npm run lint
npx tsc --noEmit
```

Both must pass. If TypeScript complains that some callers of `AiGeneratedArticle` no longer satisfy the new required field, make `keyPhrases` optional on the type OR default to `[]` at the call sites — preferred: keep it required inside the backend (we always have it now) and expose it as optional at the frontend API boundary (Task 5).

- [ ] **Step 8: Commit**

```bash
git add api/_lib/reading-article-generate.ts
git commit -m "feat(api/reading-generate): emit keyPhrases in both prompt paths"
```

---

## Task 5: Plumb `keyPhrases` through API types and store

**Files:**
- Modify: `src/lib/reading-generate-api.ts`
- Modify: `src/lib/reading-featured-api.ts`
- Modify: `src/store/readingLibraryStore.ts`
- Modify: `src/pages/DailyReading.tsx`

- [ ] **Step 1: Add `keyPhrases` to `GeneratedArticle`**

In `src/lib/reading-generate-api.ts`, update the type:

```ts
export type GeneratedArticle = {
    title: string;
    body: string;
    difficulty: ReadingDifficulty;
    summary: string;
    keyVocabulary: ReadingVocabItem[];
    /** 3–5 固定搭配；老响应没有此字段 → 默认空数组 */
    keyPhrases?: string[];
    quiz: ReadingQuizItem[];
};
```

- [ ] **Step 2: Add `keyPhrases` to `FeaturedBundleItem`**

In `src/lib/reading-featured-api.ts`:

```ts
export type FeaturedBundleItem = {
    id: string;
    title: string;
    body: string;
    difficulty: 1 | 2 | 3 | 4 | 5;
    summary: string;
    keyVocabulary: ReadingVocabItem[];
    keyPhrases?: string[];
    quiz: ReadingQuizItem[];
    topic: string;
    source: 'hot' | 'pool';
};
```

- [ ] **Step 3: Add `keyPhrases` to `ReadingArticle` and `addAiArticle`**

In `src/store/readingLibraryStore.ts`:

```ts
export interface ReadingArticle {
    /* ... existing fields ... */
    /** AI 生成文章专属：重点短语（3–5 个）。老文章可能没有此字段。 */
    keyPhrases?: string[];
    /* ... */
}
```

Update the `addAiArticle` input signature:

```ts
addAiArticle: (input: {
    /* ... existing fields ... */
    keyPhrases?: string[];
    /* ... */
}) => string;
```

And in the `addAiArticle` implementation, add `keyPhrases: input.keyPhrases` to the article object assignment.

- [ ] **Step 4: Pass `keyPhrases` through the two call sites in DailyReading**

In `src/pages/DailyReading.tsx`, find the two `addAiArticle({ ... })` calls (`openFeaturedItem` and `submitGenerate` around lines 212 and 243). Add `keyPhrases: item.keyPhrases` and `keyPhrases: a.keyPhrases` respectively, right next to the existing `keyVocabulary` line.

- [ ] **Step 5: Lint & type check**

```bash
npm run lint
npx tsc --noEmit
```

Both must pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/reading-generate-api.ts src/lib/reading-featured-api.ts src/store/readingLibraryStore.ts src/pages/DailyReading.tsx
git commit -m "feat(reading): plumb optional keyPhrases from API to store"
```

---

## Task 6: `reading-highlight.ts` — pure segment planner

**Files:**
- Create: `src/lib/reading-highlight.ts`
- Create: `src/lib/reading-highlight.test.ts`

**Design:** The planner takes a raw text string + three vocabulary inputs and returns an array of non-overlapping segments. The React layer (Task 7) maps each segment to either a text node or a `<mark>` button. Doing this as a pure function means the test is trivial and the component can focus on rendering.

- [ ] **Step 1: Write failing tests**

Create `src/lib/reading-highlight.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { planHighlightSegments } from './reading-highlight';

const opts = (o?: Partial<{ phrases: string[]; keyWords: string[]; savedWords: Set<string> }>) => ({
    phrases: o?.phrases ?? [],
    keyWords: o?.keyWords ?? [],
    savedWords: o?.savedWords ?? new Set<string>(),
});

describe('planHighlightSegments', () => {
    it('returns a single plain segment when nothing matches', () => {
        const r = planHighlightSegments('Hello world.', opts());
        expect(r).toEqual([{ text: 'Hello world.', kind: 'none' }]);
    });

    it('highlights a single keyword with word boundaries', () => {
        const r = planHighlightSegments('I like apples.', opts({ keyWords: ['apple'] }));
        expect(r).toEqual([{ text: 'I like apples.', kind: 'none' }]);
    });

    it('case-insensitive exact word match', () => {
        const r = planHighlightSegments('APPLE pie is nice.', opts({ keyWords: ['apple'] }));
        expect(r).toEqual([
            { text: 'APPLE', kind: 'keyword', term: 'apple' },
            { text: ' pie is nice.', kind: 'none' },
        ]);
    });

    it('phrases beat keywords (precedence)', () => {
        const r = planHighlightSegments('climate change matters.', opts({
            phrases: ['climate change'],
            keyWords: ['climate', 'change'],
        }));
        expect(r.map((s) => s.kind)).toEqual(['phrase', 'none']);
        expect(r[0]!.text).toBe('climate change');
    });

    it('longest phrase wins over shorter overlapping phrase', () => {
        const r = planHighlightSegments('on the verge of collapse', opts({
            phrases: ['on the verge', 'on the verge of'],
        }));
        expect(r[0]!.text).toBe('on the verge of');
        expect(r[0]!.kind).toBe('phrase');
    });

    it('saved words get the lowest precedence', () => {
        const r = planHighlightSegments('I read about climate change today.', opts({
            phrases: ['climate change'],
            keyWords: ['read'],
            savedWords: new Set(['today', 'climate']),
        }));
        const kinds = r.map((s) => s.kind);
        expect(kinds).toContain('phrase');
        expect(kinds).toContain('keyword');
        expect(kinds).toContain('saved');
        // 'climate' overlaps the phrase — phrase wins, not saved
        const savedSegs = r.filter((s) => s.kind === 'saved');
        expect(savedSegs.some((s) => s.text.toLowerCase() === 'today')).toBe(true);
        expect(savedSegs.some((s) => s.text.toLowerCase() === 'climate')).toBe(false);
    });

    it('ignores empty / whitespace inputs in the vocab lists', () => {
        const r = planHighlightSegments('Hello', opts({
            phrases: ['', '   '],
            keyWords: [''],
            savedWords: new Set(['', '  ']),
        }));
        expect(r).toEqual([{ text: 'Hello', kind: 'none' }]);
    });

    it('preserves original casing in the segment text', () => {
        const r = planHighlightSegments('Climate Change is real.', opts({
            phrases: ['climate change'],
        }));
        expect(r[0]!.text).toBe('Climate Change');
    });

    it('supports multiple disjoint matches', () => {
        const r = planHighlightSegments('cats and dogs and birds', opts({
            keyWords: ['cats', 'dogs', 'birds'],
        }));
        expect(r.map((s) => s.kind)).toEqual(['keyword', 'none', 'keyword', 'none', 'keyword']);
    });

    it('does not match word substrings', () => {
        const r = planHighlightSegments('categorical', opts({ keyWords: ['cat'] }));
        expect(r).toEqual([{ text: 'categorical', kind: 'none' }]);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/reading-highlight.test.ts`
Expected: FAIL — module `./reading-highlight` not found.

- [ ] **Step 3: Implement the planner**

Create `src/lib/reading-highlight.ts`:

```ts
export type HighlightKind = 'none' | 'phrase' | 'keyword' | 'saved';

export interface HighlightSegment {
    text: string;
    kind: HighlightKind;
    /** Lowercased matched term (for phrase/keyword/saved lookups downstream). */
    term?: string;
}

export interface HighlightPlanOptions {
    phrases: string[];
    keyWords: string[];
    savedWords: Set<string>;
}

interface Match {
    start: number;
    end: number;
    kind: Exclude<HighlightKind, 'none'>;
    term: string;
    priority: number; // lower = higher priority
}

const PRIORITY: Record<Exclude<HighlightKind, 'none'>, number> = {
    phrase: 0,
    keyword: 1,
    saved: 2,
};

function normalize(list: string[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of list) {
        const t = raw?.trim();
        if (!t) continue;
        const k = t.toLowerCase();
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(t);
    }
    return out;
}

function escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findWordMatches(
    hay: string,
    needle: string,
    kind: Exclude<HighlightKind, 'none'>,
): Match[] {
    const re = new RegExp(`\\b${escapeRegex(needle)}\\b`, 'gi');
    const out: Match[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(hay)) !== null) {
        out.push({
            start: m.index,
            end: m.index + m[0].length,
            kind,
            term: needle.toLowerCase(),
            priority: PRIORITY[kind],
        });
        if (m.index === re.lastIndex) re.lastIndex += 1;
    }
    return out;
}

function findPhraseMatches(hay: string, phrase: string): Match[] {
    if (!phrase) return [];
    const lower = hay.toLowerCase();
    const target = phrase.toLowerCase();
    const out: Match[] = [];
    let i = 0;
    while (true) {
        const idx = lower.indexOf(target, i);
        if (idx < 0) break;
        out.push({
            start: idx,
            end: idx + target.length,
            kind: 'phrase',
            term: target,
            priority: PRIORITY.phrase,
        });
        i = idx + Math.max(1, target.length);
    }
    return out;
}

function resolveMatches(matches: Match[]): Match[] {
    // Sort by: priority asc, then length desc (longer first), then start asc
    const sorted = [...matches].sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        const la = a.end - a.start;
        const lb = b.end - b.start;
        if (la !== lb) return lb - la;
        return a.start - b.start;
    });
    const claimed: Match[] = [];
    for (const m of sorted) {
        const overlaps = claimed.some((c) => !(m.end <= c.start || m.start >= c.end));
        if (!overlaps) claimed.push(m);
    }
    return claimed.sort((a, b) => a.start - b.start);
}

export function planHighlightSegments(
    text: string,
    opts: HighlightPlanOptions,
): HighlightSegment[] {
    const phrases = normalize(opts.phrases);
    const keyWords = normalize(opts.keyWords);
    const savedWords = normalize(Array.from(opts.savedWords));

    if (phrases.length + keyWords.length + savedWords.length === 0 || !text) {
        return [{ text, kind: 'none' }];
    }

    const matches: Match[] = [];
    for (const p of phrases) matches.push(...findPhraseMatches(text, p));
    for (const w of keyWords) matches.push(...findWordMatches(text, w, 'keyword'));
    for (const w of savedWords) matches.push(...findWordMatches(text, w, 'saved'));

    const resolved = resolveMatches(matches);
    if (resolved.length === 0) return [{ text, kind: 'none' }];

    const out: HighlightSegment[] = [];
    let cursor = 0;
    for (const m of resolved) {
        if (m.start > cursor) {
            out.push({ text: text.slice(cursor, m.start), kind: 'none' });
        }
        out.push({
            text: text.slice(m.start, m.end),
            kind: m.kind,
            term: m.term,
        });
        cursor = m.end;
    }
    if (cursor < text.length) {
        out.push({ text: text.slice(cursor), kind: 'none' });
    }
    return out;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/lib/reading-highlight.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/reading-highlight.ts src/lib/reading-highlight.test.ts
git commit -m "feat(reading-highlight): add pure segment planner for in-body term marks"
```

---

## Task 7: Wire highlighter into `ReadingArticle.tsx` (with toggle + click handlers)

**Files:**
- Modify: `src/pages/ReadingArticle.tsx`

- [ ] **Step 1: Add imports and a localStorage helper at file top**

Add to existing imports:

```tsx
import { planHighlightSegments, type HighlightSegment } from '@/lib/reading-highlight';
import { WordDetailModal } from '@/components/word-detail-modal';
import { Eye, EyeOff } from 'lucide-react';
```

Just below the existing module-level constants (near `DIFF_LABELS`), add:

```tsx
const SHOW_SAVED_HL_KEY = 'lingovibe_reading_show_saved_highlights';

function readSavedHlPref(): boolean {
    if (typeof window === 'undefined') return true;
    const raw = window.localStorage.getItem(SHOW_SAVED_HL_KEY);
    if (raw === null) return true;
    return raw === '1';
}

function writeSavedHlPref(v: boolean): void {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(SHOW_SAVED_HL_KEY, v ? '1' : '0');
}
```

- [ ] **Step 2: Read the saved-word set and toggle state inside the component**

Inside `ReadingArticleView`, after the existing `const addWord = useWordBankStore((s) => s.addWord);` line, add:

```tsx
const savedWordsList = useWordBankStore((s) => s.words);
const [showSavedHl, setShowSavedHl] = React.useState<boolean>(() => readSavedHlPref());
const [detailModalWordId, setDetailModalWordId] = React.useState<string | null>(null);

const savedWordSet = React.useMemo(() => {
    const s = new Set<string>();
    for (const w of savedWordsList) {
        if (w.type === 'word' && w.word?.trim()) s.add(w.word.trim().toLowerCase());
    }
    return s;
}, [savedWordsList]);

const keyWordsList = React.useMemo(
    () => (article?.keyVocabulary ?? []).map((v) => v.word).filter(Boolean),
    [article?.keyVocabulary],
);

const phrasesList = React.useMemo(
    () => article?.keyPhrases ?? [],
    [article?.keyPhrases],
);

const savedWordRecord = React.useMemo(() => {
    const m = new Map<string, string>(); // lowerWord -> id
    for (const w of savedWordsList) {
        if (w.type === 'word' && w.word?.trim()) {
            m.set(w.word.trim().toLowerCase(), w.id);
        }
    }
    return m;
}, [savedWordsList]);
```

- [ ] **Step 3: Add a `HighlightedText` inline renderer**

Inside the same file, above `ReadingArticleView`, add:

```tsx
function renderSegments(
    segments: HighlightSegment[],
    handlers: {
        onPhraseClick: (term: string, e: React.MouseEvent<HTMLElement>) => void;
        onKeyWordClick: (term: string, e: React.MouseEvent<HTMLElement>) => void;
        onSavedClick: (term: string, e: React.MouseEvent<HTMLElement>) => void;
    },
): React.ReactNode[] {
    return segments.map((seg, i) => {
        if (seg.kind === 'none') return seg.text;
        const base =
            'cursor-pointer rounded-sm transition-colors';
        if (seg.kind === 'phrase') {
            return (
                <mark
                    key={i}
                    data-term={seg.term}
                    className={`${base} bg-yellow-200/80 px-1 py-0.5 hover:bg-yellow-300/90 text-inherit`}
                    onClick={(e) => handlers.onPhraseClick(seg.term!, e)}
                >
                    {seg.text}
                </mark>
            );
        }
        if (seg.kind === 'keyword') {
            return (
                <span
                    key={i}
                    data-term={seg.term}
                    className={`${base} border-b border-dashed border-teal-500 hover:border-solid hover:bg-teal-50`}
                    onClick={(e) => handlers.onKeyWordClick(seg.term!, e)}
                >
                    {seg.text}
                </span>
            );
        }
        // saved
        return (
            <span
                key={i}
                data-term={seg.term}
                className={`${base} border-b border-dotted border-slate-400 hover:border-solid hover:bg-slate-100`}
                onClick={(e) => handlers.onSavedClick(seg.term!, e)}
            >
                {seg.text}
            </span>
        );
    });
}

function transformChildren(
    children: React.ReactNode,
    plan: (text: string) => HighlightSegment[],
    handlers: Parameters<typeof renderSegments>[1],
): React.ReactNode {
    return React.Children.map(children, (child) => {
        if (typeof child === 'string') {
            return renderSegments(plan(child), handlers);
        }
        if (React.isValidElement(child)) {
            const inner = (child.props as { children?: React.ReactNode }).children;
            if (inner == null) return child;
            return React.cloneElement(
                child,
                undefined,
                transformChildren(inner, plan, handlers),
            );
        }
        return child;
    });
}
```

- [ ] **Step 4: Build the plan() callback and click handlers inside the component**

Inside `ReadingArticleView`, after the `savedWordRecord` useMemo, add:

```tsx
const plan = React.useCallback(
    (text: string) =>
        planHighlightSegments(text, {
            phrases: phrasesList,
            keyWords: keyWordsList,
            savedWords: showSavedHl ? savedWordSet : new Set<string>(),
        }),
    [phrasesList, keyWordsList, savedWordSet, showSavedHl],
);

const openBubbleForWord = React.useCallback(
    (term: string, e: React.MouseEvent<HTMLElement>) => {
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const pad = 8;
        const w = 220;
        const left = Math.min(Math.max(rect.left + rect.width / 2 - w / 2, pad), window.innerWidth - w - pad);
        const top = Math.max(rect.top - 42, pad);
        setBubble({ left, top, text: term, kind: 'word' });
    },
    [],
);

const handleSavedClick = React.useCallback(
    (term: string) => {
        const id = savedWordRecord.get(term);
        if (id) setDetailModalWordId(id);
    },
    [savedWordRecord],
);
```

- [ ] **Step 5: Update the `READING_MARKDOWN_COMPONENTS` mapping to pipe through highlights**

Replace the existing module-level `READING_MARKDOWN_COMPONENTS` with a factory (so it can close over `plan` and handlers). Inside the component:

```tsx
const readingMarkdownComponents = React.useMemo<Components>(() => {
    const handlers = {
        onPhraseClick: openBubbleForWord,
        onKeyWordClick: openBubbleForWord,
        onSavedClick: (term: string) => handleSavedClick(term),
    };
    return {
        a({ node: _n, children, className, href, ...rest }) {
            return (
                <a
                    {...rest}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(className, 'break-words text-teal-700 underline-offset-2 hover:underline')}
                >
                    {children}
                </a>
            );
        },
        img({ node: _n, className, alt, ...rest }) {
            return (
                <img
                    {...rest}
                    alt={alt ?? ''}
                    loading="lazy"
                    className={cn(className, 'max-h-[min(50vh,420px)] w-auto max-w-full rounded-lg shadow-sm')}
                />
            );
        },
        p({ node: _n, children, ...rest }) {
            return <p {...rest}>{transformChildren(children, plan, handlers)}</p>;
        },
        li({ node: _n, children, ...rest }) {
            return <li {...rest}>{transformChildren(children, plan, handlers)}</li>;
        },
        blockquote({ node: _n, children, ...rest }) {
            return <blockquote {...rest}>{transformChildren(children, plan, handlers)}</blockquote>;
        },
    };
}, [plan, openBubbleForWord, handleSavedClick]);
```

Remove the old module-level `READING_MARKDOWN_COMPONENTS` constant entirely. Update the `<ReactMarkdown ...>` call further down to pass `components={readingMarkdownComponents}`.

- [ ] **Step 6: Add the toolbar toggle**

Inside the sticky toolbar (the div near line 484 that holds the 翻译全文 + 朗读全文 buttons), add after the two existing buttons:

```tsx
<Button
    type="button"
    size="sm"
    variant="ghost"
    className="h-8 gap-1 text-slate-600 hover:text-slate-900"
    onClick={() => {
        const next = !showSavedHl;
        setShowSavedHl(next);
        writeSavedHlPref(next);
    }}
    title={showSavedHl ? '已标注生词本里的词；点击隐藏' : '已隐藏；点击显示生词本里的词'}
>
    {showSavedHl ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
    {showSavedHl ? '隐藏已学词' : '显示已学词'}
</Button>
```

- [ ] **Step 7: Mount WordDetailModal**

Just before the existing `<ReadingWordCardModal ... />` element (top of the return JSX), add:

```tsx
{detailModalWordId ? (() => {
    const w = savedWordsList.find((x) => x.id === detailModalWordId);
    if (!w) return null;
    return (
        <WordDetailModal
            word={w}
            isOpen={true}
            onClose={() => setDetailModalWordId(null)}
        />
    );
})() : null}
```

- [ ] **Step 8: Lint & type check**

```bash
npm run lint
npx tsc --noEmit
```

Both must pass. If lint complains about `node: _n` destructuring, follow the pattern already in `READING_MARKDOWN_COMPONENTS` (it prefixes unused args with `_`).

- [ ] **Step 9: Manual QA**

- Open an AI article (one generated after Task 4 ships — check it has `keyPhrases` in the persisted store).
- Confirm yellow phrase highlights, teal dashed keyVocab highlights, grey dotted saved-word highlights.
- Click the toolbar `Eye` button — saved highlights should disappear; preference should persist after reload.
- Click a phrase → existing bubble appears; click its "加入生词本" — word is saved.
- Click a saved (grey) word → `WordDetailModal` opens directly for that entry.

- [ ] **Step 10: Commit**

```bash
git add src/pages/ReadingArticle.tsx
git commit -m "feat(reading-article): highlight key phrases, keywords, and saved words in body"
```

---

## Task 8: `<SelectionInsightPanel>` component shell

**Files:**
- Create: `src/components/reading/selection-insight-panel.tsx`

**Design:** Self-contained responsive panel. Receives a `sentence` (the raw selection text) and two async loaders `loadTranslation(sentence)` and `loadGrammar(sentence)`. Internally manages tab, loading state, and per-sentence cache. Parent controls mount/unmount via `open` + `onClose`. Positioning input is a `DOMRect | null` (the selection's rect at open time); when null the panel renders as a bottom sheet. On `md:` breakpoint the panel always uses the floating layout; below it, it always uses bottom-sheet.

- [ ] **Step 1: Create the file with the component skeleton**

```tsx
import * as React from 'react';
import { createPortal } from 'react-dom';
import { Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export type InsightTab = 'translate' | 'grammar';

export interface SelectionInsightPanelProps {
    open: boolean;
    /** The original selected sentence text. */
    sentence: string;
    /** Rect of the selection at open-time. On `md:` breakpoint, used to anchor the floating panel. */
    anchorRect: DOMRect | null;
    initialTab: InsightTab;
    /** Invoked on first entry to each tab (cached after that per sentence). */
    loadTranslation: (sentence: string) => Promise<string>;
    loadGrammar: (sentence: string) => Promise<string>;
    onClose: () => void;
}

function useMediaIsDesktop(): boolean {
    const [isDesktop, setIsDesktop] = React.useState(
        () => typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches,
    );
    React.useEffect(() => {
        if (typeof window === 'undefined') return;
        const mq = window.matchMedia('(min-width: 768px)');
        const onChange = () => setIsDesktop(mq.matches);
        mq.addEventListener?.('change', onChange);
        return () => mq.removeEventListener?.('change', onChange);
    }, []);
    return isDesktop;
}

interface CacheEntry {
    translate?: { data?: string; error?: string; loading: boolean };
    grammar?: { data?: string; error?: string; loading: boolean };
}

export function SelectionInsightPanel(props: SelectionInsightPanelProps) {
    const { open, sentence, anchorRect, initialTab, loadTranslation, loadGrammar, onClose } = props;
    const [tab, setTab] = React.useState<InsightTab>(initialTab);
    const [, force] = React.useReducer((x) => x + 1, 0);
    const cacheRef = React.useRef<Map<string, CacheEntry>>(new Map());
    const isDesktop = useMediaIsDesktop();
    const panelRef = React.useRef<HTMLDivElement>(null);

    const key = sentence;

    const entry = (): CacheEntry => {
        let e = cacheRef.current.get(key);
        if (!e) {
            e = {};
            cacheRef.current.set(key, e);
        }
        return e;
    };

    const ensure = React.useCallback(
        (t: InsightTab) => {
            const e = entry();
            const slot = t === 'translate' ? e.translate : e.grammar;
            if (slot && (slot.loading || slot.data !== undefined || slot.error !== undefined)) return;
            const loader = t === 'translate' ? loadTranslation : loadGrammar;
            const next = { loading: true } as CacheEntry['translate'];
            if (t === 'translate') e.translate = next;
            else e.grammar = next;
            force();
            loader(sentence)
                .then((data) => {
                    if (t === 'translate') e.translate = { loading: false, data };
                    else e.grammar = { loading: false, data };
                })
                .catch((err) => {
                    const msg = err instanceof Error ? err.message : '加载失败';
                    if (t === 'translate') e.translate = { loading: false, error: msg };
                    else e.grammar = { loading: false, error: msg };
                })
                .finally(() => force());
        },
        [sentence, loadTranslation, loadGrammar],
    );

    React.useEffect(() => {
        if (open) {
            setTab(initialTab);
            ensure(initialTab);
        }
    }, [open, initialTab, key, ensure]);

    React.useEffect(() => {
        if (!open) return;
        const onKey = (ev: KeyboardEvent) => {
            if (ev.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    React.useEffect(() => {
        if (!open) return;
        const onMouseDown = (ev: MouseEvent) => {
            const el = panelRef.current;
            if (el && ev.target instanceof Node && el.contains(ev.target)) return;
            onClose();
        };
        document.addEventListener('mousedown', onMouseDown);
        return () => document.removeEventListener('mousedown', onMouseDown);
    }, [open, onClose]);

    if (!open) return null;

    const e = entry();
    const active = tab === 'translate' ? e.translate : e.grammar;

    const floatingStyle: React.CSSProperties = (() => {
        if (!isDesktop || !anchorRect) return {};
        const width = Math.min(440, Math.max(320, Math.floor(window.innerWidth * 0.3)));
        const gap = 8;
        const margin = 16;
        let top = anchorRect.bottom + gap;
        const estimatedHeight = 260;
        if (top + estimatedHeight > window.innerHeight - margin) {
            top = Math.max(margin, anchorRect.top - gap - estimatedHeight);
        }
        let left = anchorRect.left + anchorRect.width / 2 - width / 2;
        left = Math.min(Math.max(margin, left), window.innerWidth - width - margin);
        return { position: 'fixed', top, left, width, zIndex: 60 };
    })();

    const panel = (
        <div
            ref={panelRef}
            id="selection-insight-panel"
            className={cn(
                'rounded-2xl border border-slate-200 bg-white/98 shadow-2xl backdrop-blur-sm',
                isDesktop
                    ? 'hidden md:flex md:flex-col'
                    : 'fixed inset-x-0 bottom-0 z-[60] flex max-h-[70vh] flex-col rounded-b-none pb-[env(safe-area-inset-bottom,0px)] md:hidden',
            )}
            style={isDesktop ? floatingStyle : undefined}
            onMouseDown={(e) => e.stopPropagation()}
        >
            {!isDesktop && (
                <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-slate-300/80" aria-hidden />
            )}
            <header className="flex items-start gap-2 border-b border-slate-100 p-3">
                <p className="line-clamp-2 flex-1 text-xs italic text-slate-600" title={sentence}>
                    “{sentence}”
                </p>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0 text-slate-400 hover:text-slate-700"
                    onClick={onClose}
                    aria-label="关闭"
                >
                    <X className="h-3.5 w-3.5" />
                </Button>
            </header>
            <nav className="flex gap-1 border-b border-slate-100 px-2 pt-2" role="tablist">
                {(['translate', 'grammar'] as const).map((t) => (
                    <button
                        key={t}
                        role="tab"
                        aria-selected={tab === t}
                        onClick={() => {
                            setTab(t);
                            ensure(t);
                        }}
                        className={cn(
                            'rounded-t-md border-b-2 px-3 py-1.5 text-xs font-medium transition-colors',
                            tab === t
                                ? 'border-teal-600 text-teal-800'
                                : 'border-transparent text-slate-500 hover:text-slate-800',
                        )}
                    >
                        {t === 'translate' ? '翻译（中文）' : '语法分析'}
                    </button>
                ))}
            </nav>
            <div className="min-h-[96px] overflow-auto px-3 py-3 text-sm leading-relaxed text-slate-800">
                {!active || active.loading ? (
                    <p className="flex items-center gap-1 text-slate-500">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        {tab === 'translate' ? '翻译中…' : '分析中…'}
                    </p>
                ) : active.error ? (
                    <p className="text-rose-600">{active.error}</p>
                ) : (
                    <p className="whitespace-pre-wrap">{active.data}</p>
                )}
            </div>
        </div>
    );

    return typeof document !== 'undefined' ? createPortal(panel, document.body) : null;
}
```

- [ ] **Step 2: Lint & type check**

```bash
npm run lint
npx tsc --noEmit
```

Both must pass. If `matchMedia.addEventListener` flags a type error on older lib targets, keep the optional chaining pattern shown.

- [ ] **Step 3: Commit**

```bash
git add src/components/reading/selection-insight-panel.tsx
git commit -m "feat(reading): add responsive SelectionInsightPanel with lazy tabs"
```

---

## Task 9: Integrate `<SelectionInsightPanel>` into `ReadingArticle.tsx` (remove old cards)

**Files:**
- Modify: `src/pages/ReadingArticle.tsx`

- [ ] **Step 1: Import the new panel**

Add to imports:

```tsx
import { SelectionInsightPanel, type InsightTab } from '@/components/reading/selection-insight-panel';
```

- [ ] **Step 2: Add panel state and capture selection rect**

Inside `ReadingArticleView`, add:

```tsx
const [insight, setInsight] = React.useState<{
    open: boolean;
    sentence: string;
    tab: InsightTab;
    rect: DOMRect | null;
    openedAtScrollTop: number;
} | null>(null);
```

Create a helper at the same level:

```tsx
const currentSelectionRect = React.useCallback((): DOMRect | null => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
    return sel.getRangeAt(0).getBoundingClientRect();
}, []);
```

- [ ] **Step 3: Replace `handleSentenceTranslate` and `handleGrammar`**

Remove the existing `handleSentenceTranslate` and `handleGrammar` functions entirely. Also remove the `selZh`, `selZhOpen`, `grammar`, `grammarLoading` states (keep `transLoading` — it's still used by the "翻译全文" button). Replace them with:

```tsx
const openInsight = React.useCallback(
    (sentence: string, tab: InsightTab) => {
        const rect = currentSelectionRect();
        setBubble(null);
        setInsight({
            open: true,
            sentence,
            tab,
            rect,
            openedAtScrollTop: scrollRef.current?.scrollTop ?? 0,
        });
    },
    [currentSelectionRect],
);
```

- [ ] **Step 4: Rewire the bubble buttons**

In the bubble portal JSX, the two sentence-kind buttons currently call `handleSentenceTranslate` and `handleGrammar`. Change them to:

```tsx
<Button
    type="button"
    size="sm"
    variant="secondary"
    className="h-8 flex-1 text-xs"
    onClick={() => openInsight(bubble.text, 'translate')}
>
    <Languages className="mr-1 h-3 w-3" />
    翻译（中文）
</Button>
<Button
    type="button"
    size="sm"
    variant="outline"
    className="h-8 flex-1 text-xs"
    onClick={() => openInsight(bubble.text, 'grammar')}
>
    语法分析
</Button>
```

- [ ] **Step 5: Remove the old selZh/grammar cards from the JSX body**

Delete the two blocks that render `selZhOpen && selZh` and `grammar` (roughly lines 533-554 of the current file). Keep the `fullZhOpen && fullZh` block — that one's for full-article translation and stays.

- [ ] **Step 6: Add scroll-distance auto-dismiss**

Inside the existing scroll listener effect (the one that currently does `el.addEventListener('scroll', onScroll, { passive: true })` to close the bubble), extend the `onScroll` to also close the insight panel when the distance exceeds 80px:

```tsx
const onScroll = () => {
    setBubble(null);
    setInsight((prev) => {
        if (!prev || !prev.open) return prev;
        const currentTop = scrollRef.current?.scrollTop ?? 0;
        if (Math.abs(currentTop - prev.openedAtScrollTop) > 80) return null;
        return prev;
    });
};
```

- [ ] **Step 7: Render the panel near the bottom of the JSX**

Just after the `{bubblePortal}` line at the top of the main `return`, add:

```tsx
{insight?.open ? (
    <SelectionInsightPanel
        open
        sentence={insight.sentence}
        anchorRect={insight.rect}
        initialTab={insight.tab}
        loadTranslation={(s) => fetchEnglishToChineseTranslation(s.slice(0, 4000))}
        loadGrammar={(s) => fetchReadingGrammarNotes(s)}
        onClose={() => setInsight(null)}
    />
) : null}
```

- [ ] **Step 8: Lint & type check**

```bash
npm run lint
npx tsc --noEmit
```

Both must pass.

- [ ] **Step 9: Manual QA**

- Select a long sentence in an article. Click "翻译（中文）" in the bubble.
  - Desktop: panel floats just under the sentence; if sentence is near bottom of viewport, panel flips above.
  - Mobile (resize browser < 768px): panel renders as bottom sheet with drag handle.
- Switch to "语法" tab: spinner appears, then grammar analysis. Switch back — cached, instant.
- Press ESC — panel closes.
- Click outside the panel — closes.
- Scroll the article column > 80px — panel closes automatically.
- Open the panel, then "翻译全文" should still show the old above-article card as before.

- [ ] **Step 10: Commit**

```bash
git add src/pages/ReadingArticle.tsx
git commit -m "refactor(reading-article): replace inline selZh/grammar cards with responsive panel"
```

---

## Task 10: Final sweep — lint / build / tests all green + QA receipt

**Files:** none (verification only)

- [ ] **Step 1: Run the full verification matrix**

```bash
npm run lint
npm test
npm run build
```

All three must complete without errors or warnings. If `npm run lint` complains about `max-warnings 0`, fix the warnings in place. If `npm run build` fails, it's almost always a residual `tsc` error in one of the modified files — inspect the error line, not the first failing message.

- [ ] **Step 2: Re-run the QA checklist from the spec**

Walk the list in `docs/superpowers/specs/2026-04-17-reading-and-wordbank-enhancements-design.md` "Testing plan → Manual QA checklist" and check off each item against the running app.

- [ ] **Step 3: If any QA item fails**

Create a focused fix commit for each failure. Do NOT rewrite prior commits; stack new commits on top.

- [ ] **Step 4: Summary commit (optional)**

If nothing failed and nothing was amended, no additional commit is needed. If small polish fixes happened during QA, group them:

```bash
git add -A
git commit -m "chore: polish reading & wordbank enhancements after QA"
```

- [ ] **Step 5: Announce completion**

Report the final commit SHA and summary: features shipped, any deferred items, link to spec and plan paths.

---

## Self-review

**Spec coverage**

- Word-bank accuracy (spec §1) → Task 1 (pure fn) + Task 2 (card badge) + Task 3 (modal history). ✅
- Key-phrase data plumbing (spec §2 "Data") → Task 4 (backend) + Task 5 (API/store). ✅
- Three-tier highlight with precedence (spec §2 "Highlight categories and precedence") → Task 6 (planner) + Task 7 (React wiring). ✅
- Toggle for saved-word layer persisted to localStorage (spec §2 "Toggle") → Task 7 Step 1+6. ✅
- Click behaviors: phrase/keyVocab → bubble; saved → modal (spec §2 "Click behavior") → Task 7 Step 3+4+7. ✅
- Panel: tabs, lazy load, cache (spec §3 "Component") → Task 8. ✅
- Panel: desktop floating / mobile bottom sheet with flipping logic (spec §3 "Positioning") → Task 8 `floatingStyle`. ✅
- Panel dismissal: outside click / ESC / scroll >80px (spec §3 "Dismissal") → Task 8 (outside + ESC) + Task 9 Step 6 (scroll). ✅
- Remove old selZh/grammar cards; keep fullZh (spec §3 "Scope") → Task 9 Step 5. ✅
- Testing: pure-logic `.test.ts`, no component tests (spec "Testing plan") → Task 1 Step 1-4, Task 6 Step 1-4; no component-test files created. ✅
- Out of scope (spec "Out of scope") — none of these appear in any task. ✅

**Placeholder scan:** grep'd mentally — no "TBD", "TODO", "similar to", "add error handling". All code blocks are complete.

**Type consistency:**

- `computeWordAccuracy` returns `{ rate, totalReviews, countedReviews }` — used identically in Task 2 Step 5 (destructure) and Task 3 Step 2 (same).
- `HighlightSegment.kind` values `'none' | 'phrase' | 'keyword' | 'saved'` — consistent across Task 6 impl, tests, and Task 7 renderer switch.
- `InsightTab = 'translate' | 'grammar'` — consistent between Task 8 export and Task 9 import.
- `SelectionInsightPanel` props — `open`, `sentence`, `anchorRect`, `initialTab`, `loadTranslation`, `loadGrammar`, `onClose`. Task 9 Step 7 invokes all of them.
- `keyPhrases` optionality: required in backend `AiGeneratedArticle` (Task 4), optional `?: string[]` everywhere downstream (Task 5). Consistent with "old articles degrade gracefully" in spec.
- `readSavedHlPref`/`writeSavedHlPref` — only defined and used in Task 7; self-contained.
