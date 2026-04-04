# 每日阅读（替换每日播客）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用「每日阅读」完整替换「每日播客」：文章库、联网检索入库、导入、阅读器（翻译/语法/TTS/生词）、浏览档完成驱动每日闭环，并清理旧播客数据与入口。

**Architecture:** 纯前端 Vite SPA 负责 UI 与持久化；联网 **搜索 + Jina 抽取** 经 **Serverless POST 接口**（请求体携带用户 Search API Key，服务端不落库）；LLM 调用使用 **独立 `reading_api_key`**。浏览完成用 **IntersectionObserver + scroll + document.visibilityState** 累计可见停留，词数用 `src/lib/reading-browse-rules.ts` 中的公式。

**Tech Stack:** React 18、Zustand persist、Vite 5、TypeScript、现有 `ai-chat` / `useEnglishTts` 模式可复用；Serverless 以 **Vercel Functions** 为例（`api/` 目录），可换 Cloudflare Workers 只要保持 JSON 契约一致。

**规格来源:** [docs/superpowers/specs/2026-04-04-daily-reading-design.md](../specs/2026-04-04-daily-reading-design.md)

---

## 文件结构总览（新建 / 重点修改）

| 路径 | 职责 |
|------|------|
| `src/lib/reading-browse-rules.ts` | 词数估算、`minDwellSeconds`、测验 80% 整数判定（供阅读器与测试共用） |
| `src/lib/reading-url.ts` | `canonicalizeUrl`、去重键 |
| `src/store/readingLibraryStore.ts` | 文章库 CRUD、按 URL 去重、难度 1–5、`sourceType` |
| `src/store/dailyLoopStore.ts` | `readingDone` / `markReadingDone`，persist `version: 2` 迁移 |
| `src/pages/DailyReading.tsx` | 列表 + 检索 + 导入 + 导航至阅读器（可拆子组件） |
| `src/pages/ReadingArticle.tsx` | 单篇阅读器（或同文件内 `ReadingArticleView`） |
| `api/reading-search.ts` | Serverless：搜索（示例 Bing Web Search API v7） |
| `api/reading-extract.ts` | Serverless：Jina Reader 拉取正文 |
| `vercel.json` | 将 `/api/*` 路由到函数（若部署 Vercel） |
| 删除 | `src/pages/DailyPodcast.tsx` |
| 修改 | `App.tsx`、`app-sidebar.tsx`、`dashboard-*`、`Settings.tsx`、`mockData.ts`、`podcastStore.ts`（删除或改为 reading 占位）、`wordBankStore.ts`、`learningAnalyticsStore.ts`、`Achievements.tsx` 等 |

---

### Task 1: 浏览/测验纯函数 + 单元测试

**Files:**
- Create: `src/lib/reading-browse-rules.ts`
- Create: `src/lib/reading-browse-rules.test.ts`
- Modify: `package.json`（devDependencies：`vitest`；`scripts` 增加 `"test": "vitest run"`）

- [ ] **Step 1: 添加 Vitest**

```bash
npm i -D vitest
```

在 `package.json` 的 `scripts` 中加入：`"test": "vitest run"`。

- [ ] **Step 2: 新建 `src/lib/reading-browse-rules.ts`（完整实现）**

```typescript
/** 规格：D = clamp(round(0.06 * W), 40, 180)，W 为英文词数；中文可用等效词数。 */
export function countEnglishWords(text: string): number {
    const m = text.trim().match(/[a-zA-Z]+(?:['’][a-zA-Z]+)?/g);
    return m ? m.length : 0;
}

/** 中文等效词数：规格允许实现阶段定常数，默认 chars/2。 */
export function equivalentWordCountForMixedText(text: string): number {
    const en = countEnglishWords(text);
    const cjk = (text.match(/[\u4e00-\u9fff]/g) ?? []).length;
    return en + Math.ceil(cjk / 2);
}

export function minDwellSecondsForBrowse(wordCount: number): number {
    const raw = Math.round(0.06 * wordCount);
    return Math.min(180, Math.max(40, raw));
}

/** 测验通过：答对*5 >= 总题*4，且总题 >= 5（由调用方保证题量）。 */
export function passesQuizAtLeastEightyPercent(correct: number, total: number): boolean {
    if (total < 5) return false;
    return correct * 5 >= total * 4;
}
```

- [ ] **Step 3: 新建测试 `src/lib/reading-browse-rules.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import {
    minDwellSecondsForBrowse,
    passesQuizAtLeastEightyPercent,
    equivalentWordCountForMixedText,
} from './reading-browse-rules';

describe('minDwellSecondsForBrowse', () => {
    it('clamps low', () => expect(minDwellSecondsForBrowse(10)).toBe(40));
    it('scales', () => expect(minDwellSecondsForBrowse(1000)).toBe(60));
    it('clamps high', () => expect(minDwellSecondsForBrowse(10000)).toBe(180));
});

describe('passesQuizAtLeastEightyPercent', () => {
    it('rejects under 5 questions', () => expect(passesQuizAtLeastEightyPercent(4, 4)).toBe(false));
    it('5/5 passes', () => expect(passesQuizAtLeastEightyPercent(5, 5)).toBe(true));
    it('4/5 passes', () => expect(passesQuizAtLeastEightyPercent(4, 5)).toBe(true));
    it('3/5 fails', () => expect(passesQuizAtLeastEightyPercent(3, 5)).toBe(false));
});
```

- [ ] **Step 4: 运行测试**

```bash
npm run test
```

Expected: 全部 PASS。

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/lib/reading-browse-rules.ts src/lib/reading-browse-rules.test.ts
git commit -m "feat(reading): add browse/quiz rule helpers and vitest"
```

---

### Task 2: URL 规范化与去重键

**Files:**
- Create: `src/lib/reading-url.ts`

- [ ] **Step 1: 实现 `canonicalizeUrl(raw: string): string | null`**

逻辑要点：仅允许 `http:` / `https:`；`new URL` 解析失败返回 `null`；去掉 hash；host 小写；可选去掉末尾 `/`（路径级一致即可）。导出 `sameCanonicalUrl(a, b)`。

- [ ] **Step 2: 在 `reading-browse-rules.test.ts` 或新文件中对 `canonicalizeUrl` 写 2～3 个用例**（同 host 不同 hash 应相等）。

- [ ] **Step 3: `npm run test`**

- [ ] **Step 4: Commit** `feat(reading): add canonical URL helper`

---

### Task 3: `readingLibraryStore`（持久化文章库）

**Files:**
- Create: `src/store/readingLibraryStore.ts`

- [ ] **Step 1: 定义类型**

```typescript
export type ReadingDifficulty = 1 | 2 | 3 | 4 | 5;
export type ReadingSourceType = 'web_curated' | 'user_import';

export interface ReadingArticle {
    id: string;
    canonicalUrl: string | null;
    sourceTitle: string;
    content: string;
    fetchedAt: number;
    difficulty: ReadingDifficulty;
    sourceType: ReadingSourceType;
}
```

- [ ] **Step 2: Zustand `persist`，name 例如 `lingovibe_reading_library`，version 1**

Actions（示例）：`addOrGetByUrl`（web：必须有 url+title；重复则返回已有 id）、`addUserImport`（title 可由用户填或首行截断）、`updateDifficulty`、`remove`、`getById`。

- [ ] **Step 3: `npm run build`** 确认无 TS 错误。

- [ ] **Step 4: Commit** `feat(reading): add reading library store`

---

### Task 4: 每日闭环与分析事件 — 播客 → 阅读

**Files:**
- Modify: `src/store/dailyLoopStore.ts`
- Modify: `src/store/learningAnalyticsStore.ts`
- Modify: `src/lib/learning-analytics.ts`（若 `life` 类型含 `podcastSessions`）
- Modify: `src/pages/Achievements.tsx`

- [ ] **Step 1: `dailyLoopStore`**：`podcastDone` → `readingDone`，`markPodcastDone` → `markReadingDone`；`persist` **version 改为 `2`**，在 `migrate` 中把旧状态 `podcastDone` 映射到 `readingDone`（若旧 persist 仅有 v1 字段则读入时默认 `readingDone: false`）。`syncDailyLoopDate` 同步重置字段名。

- [ ] **Step 2: `learningAnalyticsStore`**：`podcast_session` 改为 `reading_session`（或新增 `reading_session` 并废弃 podcast，以 grep 为准统一）；`recordPodcastSession` → `recordReadingSession`；初始 `life.podcastSessions` → `readingSessions`（Achievements 同步改条件）。

- [ ] **Step 3: `Achievements.tsx`**：成就 `podcast-1` 改为阅读闭环相关描述与 `life.readingSessions`（或等价字段）。

- [ ] **Step 4: 全局 `grep podcast` / `Podcast`** 在 `src/` 下修编译通过。

- [ ] **Step 5: Commit** `refactor: daily loop and analytics use reading instead of podcast`

---

### Task 5: 启动时清理旧播客 localStorage

**Files:**
- Create: `src/lib/migrations/clear-legacy-podcast-storage.ts`（或并入 `main.tsx` / `App.tsx` 单次 effect）
- Modify: `src/App.tsx`

- [ ] **Step 1: 枚举并删除以下 key（存在则 `removeItem`）**

`podcast_api_key`、`saved_podcasts`、`currentPodcastSession`、`lingovibe_podcast_library`（与 `podcastStore` persist name 一致）。

- [ ] **Step 2: 在应用根组件 `useEffect` 首屏执行一次**（开发环境可 `console.info` 记录已清理）。

- [ ] **Step 3: 移除 `App.tsx` 对 `usePodcastStore` hydrate 的依赖**（若 store 文件删除则同步删 import）。

- [ ] **Step 4: Commit** `chore: clear legacy podcast localStorage on boot`

---

### Task 6: 删除播客页与路由改名

**Files:**
- Delete: `src/pages/DailyPodcast.tsx`
- Modify: `src/App.tsx`：`Page` 类型 `'daily-podcast'` → `'daily-reading'`，`pageTitles`、switch case
- Modify: `src/components/dashboard/app-sidebar.tsx`
- Modify: `src/components/dashboard/dashboard-quick-actions.tsx`
- Modify: `src/components/layout/mobile-tab-bar.tsx`
- Modify: `src/components/dashboard/dashboard-daily-loop.tsx`（文案 + `page: 'daily-reading'` + `markReadingDone`）
- Modify: `src/pages/Dashboard.tsx`（若有硬编码导航）

- [ ] **Step 1: 删除 `DailyPodcast.tsx`**

- [ ] **Step 2: 全局替换路由 id**（注意 TypeScript 联合类型一并更新）

- [ ] **Step 3: `npm run build`**

- [ ] **Step 4: Commit** `refactor: remove daily podcast page and rename route to daily-reading`

---

### Task 7: Settings — 阅读模型 Key + 搜索 Key

**Files:**
- Modify: `src/pages/Settings.tsx`

- [ ] **Step 1: `useLocalStorage('reading_api_key', '')` 与 `useLocalStorage('reading_search_api_key', '')`**

- [ ] **Step 2: 移除「每日播客专属 Key」区块 UI 与 `podcast_api_key` 写入**

- [ ] **Step 3: 文案说明**：阅读 LLM Key 用于翻译/语法；Search Key 经自建 Serverless 调用搜索 API（不在此页暴露给第三方除约定服务外）。

- [ ] **Step 4: Commit** `feat(settings): reading api keys for daily reading`

---

### Task 8: Serverless — 搜索 + Jina 抽取

**Files:**
- Create: `api/reading-search.ts`（Node runtime，与 Vercel 约定一致）
- Create: `api/reading-extract.ts`
- Create: `vercel.json`
- Create: `.env.example`（文档用途：`READING_SEARCH_ENDPOINT` 或说明使用 Bing v7）

**契约（须与前端一致）:**

- `POST /api/reading-search`  
  Body: `{ "q": string, "key": string }`  
  Response: `{ "results": { "url": string, "title": string, "snippet": string }[] }`  
  实现：用 `key` 调 **Bing Web Search API v7**（`https://api.bing.microsoft.com/v7.0/search`），Header `Ocp-Apim-Subscription-Key: key`。勿 `console.log` 完整 key。

- `POST /api/reading-extract`  
  Body: `{ "url": string }`  
  Response: `{ "markdown": string, "title": string | null }`  
  实现：`fetch('https://r.jina.ai/' + encodeURIComponent(url))`，把文本写入 `markdown`；失败返回 502 + `{ error }`。

- [ ] **Step 1: 编写两函数并本地 `vercel dev` 或单元 mock 验证**（若无法本地跑，至少在 PR 描述写 curl 样例）。

- [ ] **Step 2: `vercel.json` 路由**

```json
{
  "rewrites": [{ "source": "/api/(.*)", "destination": "/api/$1" }]
}
```

（以 Vercel 文档为准；若使用 `api/` 目录默认映射可简化。）

- [ ] **Step 3: 前端 env**：`VITE_READING_API_BASE` 指向部署 origin（开发可为 `http://localhost:3000` 或代理）。

- [ ] **Step 4: Commit** `feat(api): reading search and jina extract endpoints`

---

### Task 9: `DailyReading` 列表页 — 检索、勾选入库、快捷标签、导入

**Files:**
- Create: `src/pages/DailyReading.tsx`（及可选 `src/components/reading/*`）
- Modify: `src/App.tsx` 渲染 `DailyReadingPage`

**行为对齐规格:**

- 搜索框 + 提交 → `POST` 到 `${VITE_READING_API_BASE}/api/reading-search`，body 带 `q` 与 Settings 中的 search key。
- 结果列表多选 checkbox →「入库」：对每条先 `POST /api/reading-extract`，校验返回 title/url；调用 `addOrGetByUrl`；若重复则 toast「已在库」并 `navigate` 到阅读器可选。
- 快捷标签：字符串数组常量，点击填入搜索框。
- 导入：textarea + `.txt` file input → `addUserImport`，`canonicalUrl: null`，`sourceTitle` 用户输入或文件名。

- [ ] **Step 1: 搭建页面骨架与路由连通**

- [ ] **Step 2: 接通 API 与 store**

- [ ] **Step 3: 错误与空态、loading**

- [ ] **Step 4: `npm run build`**

- [ ] **Step 5: Commit** `feat(reading): daily reading list search and import`

---

### Task 10: 阅读器页 — 翻译、语法、TTS、生词、测验占位、信任文案

**Files:**
- Create: `src/pages/ReadingArticle.tsx`（或 `src/components/reading/ReadingArticleView.tsx`）
- Modify: `src/lib/ai-chat.ts`（如需要新增 `readingTranslationPrompt` / `readingGrammarPrompt` 系统提示，**勿**与 Emma 微课混用）
- Reuse: `useEnglishTts` 或同类；`useWordBankStore.addWord`

**交互对齐规格 §4:**

- 正文可选中；**选区翻译**、**整篇翻译**两个按钮，译文区默认隐藏，点击后展示（可复用 `fetchEnglishToChineseTranslation` 模式，Key 用 `reading_api_key`）。
- **语法分析**：仅选区，调用 DeepSeek（新 prompt：输出中文解析，短段落）。
- **朗读**：整篇 / 选区两按钮，浏览器 `speechSynthesis`。
- **生词本**：选词或按钮添加（与 WordBank 一致字段，`context` 带文章标题）。
- **测验**：灰色卡片「即将推出」。
- 页底 **信任说明**（模型 Key、搜索经 Serverless、语音本地）。

- [ ] **Step 1: 阅读器布局与滚动容器**（用于 Task 11 监听）

- [ ] **Step 2: 四个能力接线**

- [ ] **Step 3: 测验占位 + 文案**

- [ ] **Step 4: `npm run build`**

- [ ] **Step 5: Commit** `feat(reading): article reader with translate grammar tts wordbank`

---

### Task 11: 浏览完成检测 + `markReadingDone`

**Files:**
- Create: `src/hooks/use-reading-browse-complete.ts`（或 `src/lib/use-reading-browse-complete.ts`）
- Modify: `ReadingArticle.tsx`

**逻辑要点:**

- `wordCount = equivalentWordCountForMixedText(content)`，`requiredSeconds = minDwellSecondsForBrowse(wordCount)`。
- 用 `IntersectionObserver` 标记正文各段/容器是否曾进入视口，或监听 scroll：距底部小于阈值视为「到文末」。
- `visibleAccumulatedMs`：在 `document.visibilityState === 'visible'` 且窗口 focus 时 `requestAnimationFrame` 或 `setInterval(1000)` 累加；切 tab 暂停。
- 当「到文末」且 `visibleAccumulatedMs >= requiredSeconds * 1000` 时，调用 **一次性** `markReadingDone()` 与 `recordReadingSession()`（注意防抖重复调用）。

- [ ] **Step 1: 实现 hook，导出 `{ browseComplete, progressHint }` 供 UI 可选展示**

- [ ] **Step 2: 接入阅读器**

- [ ] **Step 3: 手动在浏览器验证**（短文 40s、长文上限 180s）

- [ ] **Step 4: Commit** `feat(reading): browse completion drives daily loop`

---

### Task 12: 首页 Vibe Spotlight 与 mock 数据

**Files:**
- Modify: `src/components/dashboard/dashboard-vibe-spotlight.tsx`
- Modify: `src/lib/mockData.ts`
- Delete 或重写: `src/store/podcastStore.ts`

**方向:** 移除「播客库 + TTS 试听」依赖；改为 **推荐阅读卡片**（可从 `readingLibraryStore` 取最近一篇或静态 copy），或 **引导去每日阅读**。删除 `MOCK_PODCAST_EPISODES` 与 `seedDemoDataIfEmpty` 中对 `usePodcastStore` 的写入。

- [ ] **Step 1: 改 UI 文案与交互**

- [ ] **Step 2: 删除 `podcastStore.ts` 及所有 import**

- [ ] **Step 3: `npm run build`**

- [ ] **Step 4: Commit** `refactor(dashboard): replace podcast spotlight with reading`

---

### Task 13: 杂项文案与类型收尾

**Files:**
- Modify: `src/pages/CourseDetail.tsx`（「播客」→「阅读」）
- Modify: `dashboard-recent-words.tsx`、`stat-cards.tsx`、`MasteryRadarChart.tsx` 等纯文案
- Modify: `wordBankStore.ts`：`getWordsForPodcast` 若已无调用则删除或改名为 `getWordsForReading` 并在未来阅读功能使用（当前可删若 grep 无引用）

- [ ] **Step 1: `grep -i podcast src` 清零业务引用**

- [ ] **Step 2: `npm run lint` 与 `npm run build`**

- [ ] **Step 3: Commit** `chore: podcast-to-reading copy and cleanup`

---

## 规格覆盖自检（plan vs spec）

| 规格章节 | 对应 Task |
|----------|-----------|
| 列表、联网检索、手动勾选入库、出处 | 8, 9 |
| 去重 URL | 2, 3 |
| 难度 5 档 + 用户覆盖不展示旧系统值 | 3, 9 UI |
| 导入 粘贴/txt | 9 |
| 最低档公式 + 闭环任意一篇 | 1, 11, 4 |
| 测验规则（实现占位 + 函数） | 1, 10 |
| 阅读器四能力 + 测验占位 | 10 |
| 独立 Key + Search Key | 7, 8 |
| Serverless + Jina | 8 |
| 移除播客、清理存储 | 5, 6, 12, 13 |
| 信任文案 | 10 |

---

## 执行方式说明

**Plan complete and saved to `docs/superpowers/plans/2026-04-04-daily-reading.md`. Two execution options:**

1. **Subagent-Driven (recommended)** — 每个 Task 派生子代理执行，任务间人工复核。  
2. **Inline Execution** — 本会话按 Task 顺序实现，批量提交并在关键 Task 后停顿检查。

**Which approach?**（若你直接说「开始实现」，默认按 **Inline** 在本仓库连续改代码。）
