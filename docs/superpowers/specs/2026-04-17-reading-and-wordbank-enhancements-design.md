# Reading & Wordbank Enhancements — Design

**Date:** 2026-04-17
**Status:** Draft (awaiting user review)

## Context

Inspired by competing apps, we want three incremental improvements:

1. **Word-bank memory accuracy** — show per-word review accuracy on each card, plus a short review history in the detail modal.
2. **In-body key term highlighting** — annotate key phrases (yellow background), AI-selected key vocabulary (teal dotted underline), and words the user has already saved (light grey dotted underline) directly inside the article body.
3. **Selection insight panel** — replace the current "above-the-article" translation/grammar cards with a single responsive panel that floats near the selection on desktop and slides up from the bottom on mobile.

All three changes live inside the existing Daily Reading / Word Bank flows. No schema migrations are required for existing user data.

## Decisions

### 1. Word-bank memory accuracy

- **Calculation:** lifetime accuracy from `reviewLogStore.entries` — `know / (know + forgot)`. `learning` outcomes are **excluded from both numerator and denominator** (they are self-reported "still learning" and shouldn't penalize or reward the accuracy number).
- **Counts used in the UI:**
  - `countedReviews = know + forgot` — drives the accuracy rate and the threshold check.
  - `totalReviews = know + forgot + learning` — the human-readable count shown next to the percentage (reflects every time the user touched the word).
- **Threshold:** hide the percentage when `countedReviews < 3`. Show only the review count in that case.
- **Scope:** only applies to items with `type === 'word'`. Sentence items keep the current "复习：0" placeholder.
- **Badge copy:**
  - `countedReviews ≥ 3`: `✓ 87% · 12次`（`12` = `totalReviews`）
  - `0 < countedReviews < 3` or `only learning entries exist`: `复习 2 次`（`2` = `totalReviews`）
  - `totalReviews === 0`: `未复习`
- **History view:** `WordDetailModal` gains a "最近复习" section showing up to 10 entries (`outcome` icon + formatted timestamp).

### 2. In-body key term highlighting

**Data**

- `ReadingArticle` gains an optional `keyPhrases?: string[]` field (3–5 items, stored as-is with original casing; matching is case-insensitive).
- `api/_lib/reading-article-generate.ts` prompt and response schema extended to request "3–5 固定短语/搭配，必须在正文中逐字出现，保留原文大小写". Missing or malformed phrases fall back to an empty array — no error.
- Old articles without `keyPhrases` degrade gracefully (phrases simply don't highlight).

**Highlight categories and precedence**

When rendering an article we pass three inputs to the highlighter:

1. `keyPhrases: string[]` — yellow background, rounded corners
2. `keyVocabularyWords: string[]` — teal dotted underline
3. `savedWords: Set<string>` — light grey dotted underline

Matching precedence (highest first): phrase > keyVocabulary word > saved word. A token that overlaps multiple categories renders with the highest-priority style only. Phrase ranges are claimed first to prevent a single word inside a phrase from being double-highlighted.

**Matching rules**

- Phrases: case-insensitive string match, longest-first to avoid partial clobbering.
- Single words: `\b` word boundaries, case-insensitive.
- No lemma / inflection matching (out of scope — see below).
- Skip matches inside `<code>`, links, or HTML attributes. Implementation: run the highlighter on the **rendered text nodes** (not raw markdown), after markdown → React transformation, to avoid corrupting markdown syntax. A single `rehype`-style plugin or a recursive `React.Children` transformer is acceptable.

**Toggle**

A small toolbar button `显示已学词` controls category 3 (saved words) only. Phrases and keyVocabulary are always visible. State persists in `localStorage` under key `lingovibe_reading_show_saved_highlights`. Default: `true`.

**Click behavior**

- Click on a phrase or keyVocabulary word → opens the existing selection bubble at the click location (`kind: 'word'`), pre-filled with the term. Reuses existing `addWordFromBubble` / `openWordCard` flow.
- Click on a saved word → directly opens `WordDetailModal` for that entry. No intermediate bubble.

### 3. Selection insight panel

**Scope**

Replaces two existing UI blocks above the article body:

- `selZh` / `selZhOpen` card (selection translation)
- `grammar` card (grammar analysis)

`fullZh` (full-article translation) **keeps its current behavior** — it is not a selection-scoped result and stays as the existing card under the toolbar.

**Component**

A new `<SelectionInsightPanel>` in `src/components/reading/selection-insight-panel.tsx`:

```
SelectionInsightPanel
├── Header: truncated original sentence + close button
├── Tabs: 翻译 | 语法   (lazy: fires API only when tab is first entered)
└── Body: loading | error | result
```

Tab results are cached inside the panel for the current `sentenceKey` (the selected text). Switching tabs after both have loaded is free.

**Trigger**

From the existing selection bubble's buttons:

- "翻译（中文）" → mount panel, activate "翻译" tab, run translation.
- "语法分析" → mount panel, activate "语法" tab, run grammar analysis.

The bubble closes when the panel opens.

**Positioning**

- **Desktop (`md:` breakpoint and above):** `position: fixed`. Anchor: below the selection's `getBoundingClientRect()` by 8px. If bottom edge would overflow the viewport, flip above the selection. If left/right edge would overflow, clamp with 16px viewport margin. Panel width: clamp(320px, 30vw, 440px).
- **Mobile (below `md:`):** bottom sheet. `position: fixed; bottom: 0; left: 0; right: 0`. Max height `70vh`. Small drag handle at top (purely visual — no gesture dismissal this iteration).
- Single component; branch on Tailwind breakpoint using `md:` utilities plus a `useMediaQuery` hook if needed for imperative positioning.

**Dismissal**

- Click outside the panel (and outside the selection).
- ESC key.
- Article scroll distance > 80px since panel opened (selection is no longer visible).

## File change inventory

| File | Change |
|---|---|
| `src/lib/word-stats.ts` *(new)* | `computeWordAccuracy(entries, wordId)` pure fn + tests |
| `src/lib/word-stats.test.ts` *(new)* | Tests for threshold, `learning` handling, empty log |
| `src/pages/WordBank.tsx` | Replace `"复习：0"` placeholder with accuracy badge component |
| `src/components/word-detail-modal.tsx` | Add "最近复习" history section (last 10 entries) |
| `src/store/readingLibraryStore.ts` | Add `keyPhrases?: string[]` to `ReadingArticle` interface and `addAiArticle` input |
| `api/_lib/reading-article-generate.ts` | Prompt + schema: produce 3–5 `keyPhrases`; graceful fallback |
| `src/lib/reading-generate-api.ts` | Propagate `keyPhrases` through the API boundary |
| `src/lib/reading-featured-api.ts` | Same propagation for featured endpoint |
| `src/lib/reading-highlight.ts` *(new)* | `highlightBodyNodes(children, { phrases, keyWords, savedWords })` React transform + tests |
| `src/lib/reading-highlight.test.ts` *(new)* | Precedence, boundary, case-insensitivity, overlap tests |
| `src/pages/ReadingArticle.tsx` | Wire highlighter into `ReactMarkdown` output, add toolbar "显示已学词" toggle, mount `<SelectionInsightPanel>`, remove old `selZh`/`grammar` cards |
| `src/components/reading/selection-insight-panel.tsx` *(new)* | Panel component (floating + bottom sheet variants, tabs, lazy API, caching, dismissal) |
| `src/components/reading/selection-insight-panel.test.tsx` *(new)* | Tab switch, caching, dismissal behavior tests |

## Out of scope (explicit YAGNI)

- Sliding-window accuracy (recent-N) — revisit if users complain lifetime feels "stuck".
- Accuracy-based SRS weighting / reordering — current SRS logic unchanged.
- Phrase lemma / inflection matching (e.g., "reshape" ≠ "reshaped" as phrase match).
- Per-article override for the "显示已学词" toggle — global preference only.
- Customizable highlight colors.
- Gesture dismissal for bottom sheet (drag-to-close).
- Data migration for articles already in the library — they degrade gracefully (no `keyPhrases`).
- Generating `keyPhrases` retroactively for old articles via a backfill job.

## Testing plan

- **word-stats:** pure-function unit tests; table-driven.
- **reading-highlight:** unit tests on the transform given varied inputs (empty, overlap, inside code span, case mismatch).
- **selection-insight-panel:** component tests covering tab switch, lazy API firing, cache hit, ESC / outside-click / scroll dismissal.
- **ReadingArticle.tsx:** integration test verifying that selecting text → clicking "翻译" opens the panel with the correct sentence header and that the old `selZh` card is no longer rendered.
- **WordBank.tsx / WordDetailModal:** snapshot/regression check for the new badge and history section with both `< 3`, `≥ 3`, and `0` reviews fixtures.
- Manual QA on desktop (floating) and narrow viewport (bottom sheet) for panel positioning.

## Open questions

None — all decisions above are finalized pending user review of this document.
