# Daily Reading Overhaul — Design Spec

## Problem
1. Tavily-searched articles link to URLs blocked in China (Guardian, TIME, etc.)
2. Jina Reader extraction produces garbage (nav bars, ads, footers mixed with content)
3. The "随文测验" feature has been a placeholder since launch

## Solution
Replace link-based article sourcing with AI-generated learning content while keeping all existing reader features intact.

## Tab Structure

| Tab | Label | Source | Generation |
|-----|-------|--------|-----------|
| featured | 今日精选 | Tavily hot topics (4) + fixed topic pool (4) | Cron pre-generated, stored in KV |
| custom | 自选主题 | User inputs topic + selects difficulty | DeepSeek on-demand, 5/day/IP limit |
| article | 外刊原文 | Tavily search + Jina extract | Existing logic, demoted to advanced |
| import | 导入 / 书库 | User paste/upload + local library | No AI, unchanged |

## AI-Generated Article Schema

```typescript
interface GeneratedArticle {
  title: string;           // English title
  body: string;            // English markdown, 300-800 words depending on difficulty
  difficulty: 1 | 2 | 3 | 4 | 5;
  summary: string;         // One-sentence Chinese summary
  keyVocabulary: {
    word: string;
    phonetic: string;
    pos: string;
    definitionZh: string;
    exampleSentence: string;
  }[];                     // 5-8 key words
  quiz: {
    question: string;
    options: string[];      // 4 choices
    answer: string;         // "A" | "B" | "C" | "D"
    explanationZh: string;
  }[];                     // 2-3 comprehension questions
}
```

## Difficulty Mapping

| Level | Label | Target | Word count | Vocab control |
|-------|-------|--------|-----------|---------------|
| 1 | 入门 | CEFR A1-A2 | 300-400 | High-frequency 2000 |
| 2 | 基础 | CEFR A2-B1 | 350-450 | Top 4000 |
| 3 | 中级 | CEFR B1-B2 | 400-550 | General vocabulary |
| 4 | 进阶 | CEFR B2-C1 | 500-650 | Academic/professional |
| 5 | 高阶 | CEFR C1-C2 | 600-800 | Unrestricted |

## Backend Changes

### New: `api/_lib/reading-article-generate.ts`
Core function that calls DeepSeek with a structured prompt and parses the JSON response. Shared by both cron and on-demand endpoints.

### New: `api/reading-generate.ts`
POST endpoint for on-demand generation. Accepts `{ topic: string, difficulty: 1-5 }`. Uses signing + rate limiting (5/day/IP via separate KV key prefix).

### Modified: `api/_lib/reading-featured-generate.ts`
Rewritten from "search Tavily → return links" to "search Tavily for topics → generate full articles via DeepSeek". Also generates 4 articles from a fixed topic pool.

### Modified: `api/_lib/reading-featured-cache.ts`
Updated types. Bundle now contains full `GeneratedArticle[]` instead of link stubs.

### Unchanged: `api/reading-featured-cron.ts`, `api/reading-featured-daily.ts`
The cron still calls `ensureFeaturedForDate`, and the daily endpoint still returns the cached bundle. Only the bundle's internal structure changes.

### Kept: `api/reading-search.ts`, `api/reading-extract.ts`
Used by the "外刊原文" tab. No changes.

## Frontend Changes

### Modified: `src/store/readingLibraryStore.ts`
Extend `ReadingArticle` with optional `keyVocabulary`, `quiz`, `summary` fields. Add new `sourceType` value `'ai_generated'`. Add `addAiArticle` action.

### Modified: `src/lib/reading-featured-api.ts`
Update `FeaturedBundleItem` and `FeaturedBundle` types to match new full-article structure.

### New: `src/lib/reading-generate-api.ts`
Client function to call `POST /api/reading-generate`.

### New: `src/components/reading/reading-vocab-cards.tsx`
Displays key vocabulary with phonetic, definition, example. Each word has a "加入生词本" button.

### New: `src/components/reading/reading-quiz.tsx`
Multiple-choice quiz UI. User selects answers, submits, sees score + explanations.

### Modified: `src/pages/DailyReading.tsx`
- Tabs become: 今日精选 / 自选主题 / 外刊原文 / 导入+书库
- "今日精选" shows article cards with title, summary, difficulty badge. Clicking opens reader directly (no URL extraction step)
- "自选主题" has topic input + difficulty selector + generate button

### Modified: `src/pages/ReadingArticle.tsx`
- After the article body, if `keyVocabulary` exists: render vocab cards
- After vocab cards, if `quiz` exists: render quiz component
- These replace the "随文测验 · 即将推出" placeholder

## What Stays Unchanged
- All reader toolbar features: 翻译全文, 朗读全文, 划词翻译, 划词语法分析, 查词卡片, 加入生词本
- Browse completion tracking (scroll + dwell time → daily loop)
- Import/library functionality
- Article difficulty selector in reader
