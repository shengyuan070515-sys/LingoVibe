英语学习 App 开发规范

项目背景：这是一个英语学习 App。
技术栈：Vite + React + TypeScript + Tailwind CSS。

开发原则：

严禁逻辑重复：在写新功能前，必须检索 src/components 和 src/hooks。如果已有类似功能，必须复用，禁止新建文件。

保持 UI 一致性：所有颜色、间距必须使用 Tailwind CSS 的标准类，不得在代码里写死复杂的 CSS。

状态管理单一化：跨页面的数据（生词、阅读、闭环、活跃度）统一走 `src/store/*` 下的 Zustand store，不要再在页面里单独 `useLocalStorage` 同名 key。

必须更新文档：每次修改代码后，请在本项目说明文档中记录你改了哪里，以及为什么要这么改。

## 当前数据模型（五个 store · 单一事实源）

| Store / Key | 作用 |
|---|---|
| `wordBankStore` — `lingovibe_global_wordbank` | 生词卡（word/sentence），含 SRS 字段 `level / interval / nextReviewDate / addedAt` |
| `dailyLoopStore` — `lingovibe_daily_loop` | 当日三项闭环：`reviewQueueDone / chatRoundDone / readingDone`（按本地日历日重置） |
| `reviewLogStore` — `lingovibe_review_log` | 闪卡自评流水（600 条上限），用于正确率统计 |
| `learningAnalyticsStore` — `lingovibe_learning_analytics` | 每日活跃度热图 + lifetime 计数（chat/visual/reading/srs/wordsAdded） |
| `readingLibraryStore` — `lingovibe_reading_library` | 文章库（精选 / 用户导入 / AI 生成） |

## SRS 阶梯（7 档保守版）

`src/lib/srs-utils.ts` 的 `INTERVAL_LADDER_DAYS` 为 `[1, 2, 4, 7, 14, 30, 60]`：

- 全新单词（level=0）自评「会」→ 1 天后再见
- 再自评「会」（level=1）→ 2 天；依次 4 / 7 / 14 / 30 / 60，封顶 60 天
- 「不熟」→ level 回退 max(0, level-2)，1 天后再见
- 「学习中」→ level 不动，间隔减半（最小 1 天）

## 学习闭环（与「今日闭环」三项对齐）

1. **复习队列**：FlashcardReview 通过 `selectDueWords` 取到期词；过完一轮或开页时无到期词均会 `markReviewQueueDone()`。
2. **AI 对话**：Emma 主动开场会优先把当日待复习词注入 prompt（`splitDueWordsAndFiller`）。用户发出消息且 Emma 成功回复后 `markChatRoundDone()`。
3. **每日阅读**：阅读文章滚到文末 + 累计前台停留达标后 `markReadingDone() + recordReadingSession()`。

## 模块定位提示

- 「情景微课」侧栏入口（`/courses`）是**独立练习场**：不写 `markChatRoundDone()` 也不与「今日闭环 · 完成 1 轮 AI 对话」联动；但内部对话仍走 `recordChatMessage()` 计入活跃度/lifetime。本模块通关产物是把目标词同步进生词本。
- 「今日精选」「自选主题」AI 生成的文章默认 `addedToLibrary=false`，阅读时在文章顶部点「加入书库」才会留在书库。
- 同一文章今日重复读完不会重复计分：`dailyLoopStore.tryMarkReadingArticleCompleted(articleId)` 当日首次返回 true 才会 `recordReadingSession`。

## 时区口径

- **客户端 streak / 活跃度热图 / 今日闭环**：按用户设备本地时区算「今天」（`src/lib/learning-analytics.ts` 的 `toLocalDateKey`），与手机日历保持一致。
- **服务端「今日精选阅读」KV 缓存键**：按北京时间算「今天」（`src/lib/date-key-shanghai.ts` 的 `getDateKeyShanghai`），让全球客户端共享同一份日级 AI 缓存。
- 两者各司其职，不要混用。

## 最新更新记录

### 2026-05-12 · 第二轮缺陷修复

- **AI 对话取消机制**：`callAiProxy` 新增 `options.signal`，`fetchEmmaChatCompletion / fetchProactiveOpening / fetchEnglishToChineseTranslation` 全部支持 `signal` 参数。AiChat / MicroLessonChat 在组件 unmount、切换 chat mode、开始下一次发送时 abort 上一次请求，避免离开页面后还在等待。
- **`ai_chat_v2` 体积封顶**：`capChatState` 给每模式 30 个 session、每 session 200 条消息封顶，按 `updatedAt` 倒序保留新的；当前活跃 session 强制保留。`migrateLegacyChatSessionsIfNeeded` 加载时应用一次；`AiChat` 包装 `setPersisted` 在每次写入前再应用一次。
- **删除死代码**：`src/lib/pronunciation-assessment.ts`（200+ 行未被任何文件 import 的发音评估实现）整文件移除。
- **Achievements 词汇成就只算 `type='word'`**：原先把句子也算入"开卷有益 / 词海拾贝 / 词汇猎人"，与文案「词」不符。

### 2026-05-12 · 功能缺陷修复

修复一轮真实数据 bug 与 UX 不一致：

- **生词本超过 500 词时新词丢失**：`wordBankStore.partialize` 写错方向（`slice(-500)`）——因为 `addWord` 把新词 prepend 到数组开头，`slice(-500)` 反而留下最老的 500 条、把新加的丢了。改为 `slice(0, 500)` 并抽出 `partializeWordBankWords` 便于单测。
- **阅读完成可被重复刷分**：`ReadingArticle` 的 `loggedRef` 在组件卸载后丢失，反复打开同一篇已完成文章会多次 `recordReadingSession`。给 `dailyLoopStore` 加 `readingCompletedArticleIds`（按日复位）与 `tryMarkReadingArticleCompleted(articleId)`，仅同日首次完成才计分；版本号升到 v3 并迁移老数据。
- **微课与主闭环口径冲突**：依照 A 方案「独立练习场」，`MicroLessonChat` 移除 `markChatRoundDone()` 调用与 `useDailyLoopStore` 依赖；保留 `recordChatMessage()` 让练习量自然进入活跃度/lifetime 计数。
- **AiChat 每次 render 都跑 migrate**：`useLocalStorage` 的 `initialValue` 改为 `T | (() => T)`，工厂仅在挂载首帧解析一次；AiChat 改为传函数引用 `migrateLegacyChatSessionsIfNeeded`。
- **时区口径文档化**：之前 `getDateKeyShanghai` 看起来像死代码，其实只在服务端 `api/_lib/reading-featured-cache.ts` 用。补注释说明客户端走 local TZ、服务端走 Shanghai 的双口径。
- **侧栏 / 课程页文案对齐 A 方案**：`学习路径 → 情景微课`；课程列表页加一行「独立练习场 · 不计入今日闭环三项」。

### 2026-05-12 · 文档与 UX 一致性梳理
- **改动位置**：`PROJECT_GUIDE.md`、`src/store/wordBankStore.ts`、`src/pages/Achievements.tsx`、`src/pages/Dashboard.tsx`、`src/pages/VisualDictionary.tsx`、`src/pages/AiChat.tsx`、`src/pages/ReadingArticle.tsx`
- **改动原因**：审计发现文档（SRS 阶梯 / 已下线的播客模块）与代码脱节；多个收词入口对「重复词」的反馈不一致；首页双 KPI 缺说明。
- **具体实现**：
  - 重写本文档，SRS 段落改为实际的 7 档阶梯，删除「Daily Context Pod / 播客日记」过期内容。
  - `addWord` 返回值改为 `'added' | 'duplicate' | 'invalid'`，让调用方据此 toast。
  - VisualDictionary / AiChat / ReadingArticle 在添加已收藏词时统一显示「已在生词本中」。
  - Achievements 移除已无意义的 `id.startsWith('demo-')` 过滤。
  - Dashboard 首页「今日目标 X/5 格」与「今日闭环」并行展示时，增加一行说明文案，避免用户把两套 KPI 误当成一套。

### 历史记录（仅做参考，部分模块已被替换）

#### 2026-03-28 · 决策纪要闭环（生词本主轴）— 已部分被替换
- 当时的「闪卡 1/3/7 天阶梯」已演进为上文的 7 档阶梯，请以 `src/lib/srs-utils.ts` 为准。
- 当时的「播客完成计入闭环」模块（DailyPodcast）已于后续重构中**整体替换为「每日阅读」**（`/reading` 路由 + `DailyReading.tsx`）。`dailyLoopStore` v1→v2 migration 把旧 `podcastDone` 字段迁移为 `readingDone`。
- 其余说明（生词本主轴、`use-local-storage` 持久化加固、AI 对话翻译规则）仍然有效。

#### 2026-03-26 · 全局状态与记忆引擎重构 — 部分仍有效
- 引入 Zustand 统一状态管理：仍是当前架构基础（见上文「当前数据模型」表）。
- 数据结构 SRS 字段 `addedAt / nextReviewDate / interval / level`：仍在使用。
- 「Daily Context Pod / 播客 Mock 切换」相关内容已随播客模块下线一并废弃，请忽略。
