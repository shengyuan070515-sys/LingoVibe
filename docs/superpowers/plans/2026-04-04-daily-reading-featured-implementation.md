# 每日阅读 · AI 精选外刊（8 篇 / 日 + KV + Cron）Implementation Plan

> **For agentic workers:** 建议配合 `superpowers:subagent-driven-development` 或 `superpowers:executing-plans` 按任务顺序实现；步骤使用 `- [ ]` 勾选跟踪。

**Goal:** 在「每日阅读」页增加 **北京时间每日 8 篇**（四大类 × 每类 2 篇）的 **精选外刊**区；服务端 **KV 缓存** + **Cron 预热** + **GET 兜底生成**；用户点「阅读原文」**先入库再读**；正文抽取失败时走 **摘要 + 固定付费墙退路 UI**（见决策 8）。

**决策来源（唯一产品依据）:** [../specs/2026-04-04-daily-reading-featured-decision-log.md](../specs/2026-04-04-daily-reading-featured-decision-log.md)

**Architecture:**  
- **读路径**：前端 `GET /api/reading-featured-daily`（无 body）→ 服务端计算 **北京时间 `dateKey`** → **读 KV**；若无记录则 **服务端现场生成**（与 Cron 相同逻辑）并 **SET（幂等）** 后返回。  
- **写路径（预热）**：Vercel Cron 每日触发 **`POST /api/reading-featured-cron`**（Header: `Authorization: Bearer <CRON_SECRET>`），生成当日 payload 写入 KV。  
- **生成逻辑**：对四个 `categoryId` 各执行 **2 次** 受控 Tavily 查询（`site:` + 白名单域 + 轮换/随机种子），过滤 URL 属于该类的 allowlist，**跨类去重**（同一 URL 只出现一次），得到 **8 条** `{ url, title, snippet, categoryId, categoryLabelZh }`。  
- **Tavily**：复用现有密钥 `TAVILY_API_KEY`；建议抽出 **`api/lib/tavily-search.ts`** 供 `reading-search.ts` 与精选生成共用，避免重复实现。  
- **前端入库**：对每条精选 **try `platformExtractMarkdown`** → 成功则 `addOrGetByUrl`（与现网一致）+ 难度估计；失败则 **仍入库**，带上 **摘要字段** 与 **仅摘要标志**，阅读器展示决策 8 文案与按钮。

**Tech Stack:** Vercel Functions、`@vercel/kv`（或文档等价的 Upstash REST 环境变量）、现有 `reading-extract` / `reading-url` canonicalize。

**非目标（本计划不一次做完）**  
- 历史推荐后台查询、运营后台改 query 模板（可在 KV schema 预留 `version` 字段）。  
- 将 Band 角标改为雅思 Band 7/8 UI（当前店内存 **1–5 档中文**；若精选卡片要展示额外标签，可作为可选皮肤任务）。

---

## 0. 环境与运维清单

部署前需在 **Vercel**（及本地 `.env`）配置：

| 变量 | 用途 |
|------|------|
| `TAVILY_API_KEY` | 已有；精选生成依赖 |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN`（或 Vercel KV 自动注入名） | KV 读写；以 `@vercel/kv` 文档为准 |
| `CRON_SECRET` | 长随机串；仅 Cron 与人工 curl 使用 |
| 前端 `VITE_READING_API_BASE` | 已有 |

**Cron 时间（UTC）**：北京时间 **00:05** ≈ 前一日 **16:05 UTC**（因东八区）。在 `vercel.json` 的 `crons` 中使用 `5 16 * * *`（实现前用 [时区换算](https://www.timeanddate.com/worldclock/converter.html) 再核对一次）。若 Vercel 后续支持按 TZ 写 Cron，可改为显式 `Asia/Shanghai`。

---

## 1. 文件结构总览（新建 / 重点修改）

| 路径 | 职责 |
|------|------|
| `api/lib/tavily-search.ts` | `searchTavily(query, opts)` → `results[]`，供 search 与精选共用 |
| `api/lib/reading-featured-config.ts` | 四大类 id、中文名、域名 allowlist（与决策表一致，含 aeon.co） |
| `api/lib/reading-featured-generate.ts` | `generateFeaturedBundle(dateKey)`：8 条结果 + 元数据；幂等辅助 |
| `api/lib/date-key-shanghai.ts` | `getDateKeyShanghai(date?: Date): string`（`YYYY-MM-DD`） |
| `api/reading-search.ts` | 改为调用 `searchTavily`，行为不变 |
| `api/reading-featured-daily.ts` | `GET`：读 KV → 缺失则生成 → 返回 JSON |
| `api/reading-featured-cron.ts` | `POST`：校验 `CRON_SECRET` → 写 KV |
| `vercel.json` | 增加 `crons` 指向 cron 路径 |
| `src/lib/reading-featured-api.ts` | `fetchFeaturedDaily(): Promise<FeaturedDailyResponse>` |
| `src/lib/reading-featured-config.ts`（可选） | 若前端需展示类名，可与后端常量导出名对齐（或仅后端返回 `categoryLabelZh`） |
| `src/store/readingLibraryStore.ts` | `ReadingArticle` 增加可选 `summaryOnly?: boolean`、`summaryText?: string`；`addOrGetByUrl` 允许 `content === ''` 当且仅当 `summaryOnly`；persist **version 2** 迁移 |
| `src/pages/ReadingArticle.tsx` | `summaryOnly` 时：Markdown 区展示摘要 + 固定按钮文案（决策 8）；浏览完成规则对「极短正文」降级（见任务 8） |
| `src/pages/DailyReading.tsx` | 顶部新 section：标题/副标题（域名列表文案）、**8 张卡片**（类标签 + 难度展示 + 摘要预览 +「阅读原文」） |
| `.env.example` | 补充 `KV_*`、`CRON_SECRET` 说明 |

---

## 2. KV 中 JSON 形态（建议）

```json
{
  "dateKey": "2026-04-04",
  "generatedAt": 1733318400000,
  "version": 1,
  "items": [
    {
      "categoryId": "news_world",
      "categoryLabelZh": "全球时事",
      "url": "https://...",
      "title": "...",
      "snippet": "..."
    }
  ]
}
```

**Key 命名**：`reading:featured:{dateKey}`（全小写，避免歧义）。

**幂等**：`SET` 时使用「仅当不存在」或先 `GET` 再决定是否覆盖；**兜底生成**与 **Cron** 并发时，以 **先写入者为准**（后者可 no-op 或比较 `generatedAt`）。

---

## 3. 任务分解

### Task 1：日期键与上海时区

- [ ] **Step 1**：新建 `api/lib/date-key-shanghai.ts`，导出 `getDateKeyShanghai(d?: Date): string`（`YYYY-MM-DD`），使用 `Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', ... })` 或等价可靠实现。  
- [ ] **Step 2**：新建 Vitest `api/lib/date-key-shanghai.test.ts` 或 `src/lib` 镜像测试（若测试仅跑 `src/`，则将纯函数放 `src/lib` 并由 `api` import——二选一，保持单一定义）。

### Task 2：精选域名与分类常量

- [ ] **Step 1**：新建 `api/lib/reading-featured-config.ts`，导出：  
  - `FEATURED_CATEGORIES: { id, labelZh, domains: string[] }[]`（**严格对齐决策记录**：含 **aeon.co** 在「全球时事」）。  
- [ ] **Step 2**：导出工具 `urlMatchesFeaturedDomain(url: string, domains: string[]): boolean`（用 `canonicalizeUrl` + hostname 后缀匹配，防 `www.` 差异）。

### Task 3：抽取 Tavily 调用

- [ ] **Step 1**：新建 `api/lib/tavily-search.ts`，实现 `searchTavily(q: string): Promise<{ title, url, content }[]>`（与当前 `reading-search.ts` 内逻辑一致，`max_results` 等参数可参数化）。  
- [ ] **Step 2**：重构 `api/reading-search.ts` 调用该模块，**对外 JSON 契约不变**。  
- [ ] **Step 3**：`npm run build`（含 `tsc`）通过。

### Task 4：生成 8 条精选（核心算法）

- [ ] **Step 1**：新建 `api/lib/reading-featured-generate.ts`：  
  - 入参：`dateKey`、`apiKey`（Tavily）。  
  - 对每个 category：**从 `domains` 中**用 `dateKey + categoryId` 派生稳定 **shuffle 种子**（或轮换起点），选 2 个域；对每个域构造 query，例如 `site:theguardian.com world news`（实现阶段定一版 **query 模板表**，写入同文件常量）。  
  - 调用 `searchTavily`，过滤 **hostname ∈ 该类 allowlist**；合并直至 **每类 2 条**；全局 **URL 去重**。  
  - 若某类不足 2 条：**同域重试 / 换域 / 放宽 query**（设 `maxAttempts` 上限，避免死循环与额度爆掉）。  
- [ ] **Step 2**：单元测试：对 **假数据** mock fetch 或抽取「过滤 + 去重」纯函数到可测模块。

### Task 5：KV 与 API 路由

- [ ] **Step 1**：`npm i @vercel/kv`（或项目选定包）。  
- [ ] **Step 2**：`api/reading-featured-daily.ts`：`GET` → `dateKey = getDateKeyShanghai()` → `kv.get` → 无则 `generate` → `kv.set` → `200` JSON。  
- [ ] **Step 3**：`api/reading-featured-cron.ts`：`POST`，校验 `Authorization: Bearer ${CRON_SECRET}`，然后同上生成逻辑（可强制覆盖或同样幂等，**推荐与 GET 共用** `ensureFeaturedForDate(dateKey)`）。  
- [ ] **Step 4**：`vercel.json` 增加 `crons`：`path` `/api/reading-featured-cron`、`schedule` `5 16 * * *`（注释写明 = 北京 00:05）。  
- [ ] **Step 5**：`.env.example` 更新。

### Task 6：前端拉取与 UI 区块

- [ ] **Step 1**：`src/lib/reading-featured-api.ts`：`fetchFeaturedDaily()`。  
- [ ] **Step 2**：`DailyReading.tsx` 顶部增加 **精选区块**：加载态 / 错误态 / **8 卡片网格**（`grid` 响应式）；副标题列出决策中的刊物（可中文 + 英文括号）。  
- [ ] **Step 3**：卡片展示：`categoryLabelZh`、标题、`snippet` 截断、`DIFF_LABELS[difficulty]` 可在入库前用 `estimateReadingDifficulty(snippet)` **粗估**展示，或先占位默认「基础」待读后更新（**推荐**：点「阅读原文」成功入库后用真实难度；卡片上可先显示「待读」或不显示 Band 直至入库——产品可再调，计划中写清一种默认）。

### Task 7：精选入库与抽取失败分支

- [ ] **Step 1**：扩展 `readingLibraryStore`：`summaryOnly?: boolean`、`summaryText?: string`；`addOrGetByUrl` 在 `summaryOnly === true` 时允许 `content === ''`；persist `version: 2`，`migrate` 旧数据默认无新字段。  
- [ ] **Step 2**：`DailyReading.tsx` 内 `openFeaturedItem(item)`：`addOrGetByUrl` 若 duplicate → 直接 `setOpenId`；否则 try extract → 成功正常入库；catch → `addOrGetByUrl({ ..., content: '', summaryOnly: true, summaryText: item.snippet })`（或 `stripMarkdownInlineLinks(snippet)` 可选）。  
- [ ] **Step 3**：难度估计：有正文用正文前 800 字；仅摘要用 `snippet` 估。

### Task 8：阅读器付费墙退路 UI + 浏览完成

- [ ] **Step 1**：`ReadingArticle.tsx`：若 `article.summaryOnly && article.summaryText`，主阅读区展示摘要（可用 `prose` 纯文本或 `ReactMarkdown` 仅当摘要无怪异符号）；下方 **醒目 `Button` 或 `a`**，文案 **逐字**使用决策 8：  
  `原文有付费墙限制，已为您提取核心摘要。想看全文请点此去官网。`  
  链接 `article.canonicalUrl`，`target="_blank"` `rel="noopener noreferrer"`。  
- [ ] **Step 2**：`useReadingBrowseComplete`：当 `summaryOnly` 或 **等效词数**低于某阈值时，**缩短** `minDwellSeconds` 或使用「到达摘要底部即视为 reachedEnd」（在 `ReadingArticle` 传参或 hook 内分支），避免用户永远无法完成闭环。

### Task 9：验证

- [ ] **Step 1**：`npm run test`、`npm run build`。  
- [ ] **Step 2**：本地 `vercel dev` + 配置 KV（或 mock）手测：`GET` 无 key 时生成；第二次命中缓存；`POST` cron 带 secret。  
- [ ] **Step 3**：更新决策记录 **状态** 为「已实现待验收」或另开 PR 描述链到本 plan。

---

## 4. 风险与回滚

| 风险 | 缓解 |
|------|------|
| Tavily 额度 | `max_results` 限制、每类尝试次数上限、失败项允许缺口（返回 6 条 + 错误字段，前端显示「暂缺」） |
| KV 未配置 | `GET` 返回 **503** 与明确文案；前端隐藏精选区或展示配置提示 |
| Cron 免费档限制 | 查 Vercel 当前套餐 Cron 条数；若不可用，暂以 **仅 GET 兜底** 运行（产品仍可「每日第一次访问生成」） |

---

## 5. 完成后

- 将 [决策记录](../specs/2026-04-04-daily-reading-featured-decision-log.md) 顶部 **状态** 更新为「已实现」并链到本 plan / PR。  
- 可选：删除或归档早期草案 [2026-04-04-daily-reading-featured-curation-improvement.md](../specs/2026-04-04-daily-reading-featured-curation-improvement.md)，避免与决策记录冲突。

---

**文档版本**：2026-04-04 · 初版实现计划
