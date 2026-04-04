英语学习 App 开发规范

项目背景：这是一个英语学习 App。
技术栈：Vite + React + TypeScript + Tailwind CSS。

开发原则：

严禁逻辑重复：在写新功能前，必须检索 src/components 和 src/hooks。如果已有类似功能，必须复用，禁止新建文件。

保持 UI 一致性：所有颜色、间距必须使用 Tailwind CSS 的标准类，不得在代码里写死复杂的 CSS。

状态管理单一化：如果是跨页面的数据（比如单词学习进度），请统一检查项目里是否已经有了全局状态管理（如 Zustand 或 Context），不要在每个页面里单独定义。

必须更新文档：每次修改代码后，请在本项目说明文档中记录你改了哪里，以及为什么要这么改。

## 最新更新记录 (2026-03-28)
### 决策纪要闭环（生词本主轴）
- **改动位置**：`src/lib/srs-utils.ts`，`src/store/reviewLogStore.ts`，`src/store/dailyLoopStore.ts`，`src/store/wordBankStore.ts`，`src/pages/FlashcardReview.tsx`，`src/components/dashboard/dashboard-daily-loop.tsx`，`src/pages/Dashboard.tsx`，`src/App.tsx`，`src/pages/AiChat.tsx`，`src/pages/DailyPodcast.tsx`，`src/lib/ai-chat.ts`
- **改动原因**：对齐项目内《决策纪要》：首页「今日闭环」、闪卡复习与 1/3/7 天 SRS 阶梯、待复习词注入对话开场、离线闪卡、复习日志、播客完成计入闭环。
- **具体实现**：
  - 自评「会」的间隔改为固定阶梯 1→3→7 天（替代原间隔倍增）；播客「完成本次复习」里掌握的词仍用 `updateWordProgress`，与闪卡共用同一套阶梯回写。
  - 首页在快捷入口之上增加「今日闭环」三项（复习队列 / AI 对话 / 播客），与原有活跃度并行展示。
  - 新增路由 `flashcard-review`：仅 `type === 'word'` 且已到期的词，英↔中闪卡，不依赖网络。
  - `lingovibe_daily_loop` 按本地日历日重置三项完成标记；`lingovibe_review_log` 记录每次闪卡自评（便于以后调 SRS）。
  - Emma 主动开场指令优先纳入最多 2 个今日到期词（F1b）。
- **端侧一致（2026-03-28 补充）**：侧栏增加「闪卡复习」；首页快捷入口第一项为闪卡；生词本页提供同一闪卡按钮；手机底栏在闪卡页将「首页」视为选中，避免无高亮。数据仍仅存 `localStorage`，同设备手机/桌面浏览器互通，换设备需自行同步数据。
- **API Key 持久化加固（2026-03-28）**：`use-local-storage.ts` 改为仅当 `getItem === null` 视为无记录；`JSON.parse` 失败时对字符串类 key 保留磁盘原文，避免误用空初值写回覆盖；`useLayoutEffect` 挂载时再拉盘一次；同页通过 `lingovibe-localstorage` 事件 + `storage` 多实例对齐。设置页在持久化值从外部更新时同步输入框；生词本 Key 直写 `localStorage` 后补发同步事件。
- **AI 对话修复（2026-03-28）**：`useLocalStorage` 对对象型状态增加 `JSON.stringify` 深比较后再 `setState`，避免 `ai_chat_v2` 写入后自触发拉盘、引用恒变导致更新风暴与消息丢失；Emma 系统提示增加 Rule 8 约束 `[TRANSLATION]` 必须忠实对应 `[CONTENT]`；主对话请求增加 `temperature`、空响应与 HTTP 错误信息处理；按需翻译用原文指纹写回消息并加强翻译 prompt；列表 `key` 加入内容前缀减轻下标错位。
- **播客正文（2026-03-28）**：逐词渲染恢复为原先 `inline-block` 结构以保证全文正常换行与显示；双击/点击收录后仅在 `requestAnimationFrame` 中 `getSelection().removeAllRanges()` 清除系统选区，减轻灰条与选中残留，不使用 `preventDefault` 与 `whitespace-pre` 分片，避免正文被裁切。

## 最新更新记录 (2026-03-26)
### 1. 全局状态与记忆引擎重构
- **改动位置**：新建 `src/store/wordBankStore.ts`，重构 `AiChat.tsx`, `VisualDictionary.tsx`, `Favorites.tsx`, `DailyPodcast.tsx`
- **改动原因**：之前存在两个分散的本地存储 (`word_bank` 和 `favorite_expressions`)，不利于全局数据流转。
- **具体实现**：
  - 引入 Zustand 统一状态管理。
  - 升级数据结构，增加 `addedAt`, `nextReviewDate`, `interval`, `level` 字段以支持间隔重复（SRS）。
  - 在 DailyPodcast 中实现 `getWordsForPodcast` 抽取算法和 `updateWordProgress` 复习进度回写。

### 2. Daily Context Pod 模块深度升级
- **改动位置**：`src/pages/DailyPodcast.tsx`
- **改动原因**：大模型生成的故事存在“戏精”附体、词汇超纲、格式破坏以及缺乏学习反馈闭环的问题。
- **具体实现**：
  - **定制弹窗**：新增高颜值的蓝紫主题 `Podcast Preferences` 弹窗，支持选择主题(Theme)、风格(Tone)和目标难度(Target Level)。
  - **Prompt 黑科技**：加入严苛的反戏精(Anti-Drama)规则、动态难度映射(A2-C2)，并强制返回包含 `english` 和 `chinese` 的双语 JSON 格式。
  - **数据清洗**：增加正则过滤 `replace(/[*_]/g, '')` 彻底剔除 Markdown 格式污染。
  - **一键翻译与收藏**：在主界面右上角新增『中英对照』切换按钮，并在故事文本旁提供 ⭐ 收藏至播客日记按钮。
  - **互动打卡闭环**：底部单词胶囊支持点击变绿（Mastered 状态），点击『完成本次复习』按钮后，系统自动提升这些单词的熟练度并延长下次复习间隔。

### 3. 播客会话缓存与日记本入口补全
- **改动位置**：`src/pages/DailyPodcast.tsx`
- **改动原因**：用户离开页面返回后播客内容丢失；收藏后缺少查看入口。
- **具体实现**：
  - **Session Persistence**：使用 `localStorage` 键 `currentPodcastSession` 缓存当前复习会话（中英文本、目标词、掌握状态、播放状态与生成配置），仅在『完成本次复习』时清空。
  - **播客日记本 UI**：新增『📖 我的收藏』按钮，弹出模态展示 `saved_podcasts` 列表卡片（时间、英文高亮、中文对照、取消收藏）。

### 4. 暂停真实大模型调用（节省额度）
- **改动位置**：`src/pages/DailyPodcast.tsx`
- **改动原因**：开发日记本 UI 与纯前端交互阶段，用户希望暂停真实 DeepSeek 请求以节省额度。
- **具体实现**：增加 `PODCAST_USE_MOCK` 开关，开启时跳过 fetch 请求，改为注入一段中英双语 Mock 数据（最终 UI 确认后再接回真实 API）。

### 5. 恢复真实大模型调用
- **改动位置**：`src/pages/DailyPodcast.tsx`
- **改动原因**：UI 已确认，恢复真实 API 请求以获取真实生成内容。
- **具体实现**：关闭 `PODCAST_USE_MOCK`（设为 false），恢复走真实 fetch 请求链路。
