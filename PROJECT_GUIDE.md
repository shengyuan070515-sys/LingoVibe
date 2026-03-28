英语学习 App 开发规范

项目背景：这是一个英语学习 App。
技术栈：Vite + React + TypeScript + Tailwind CSS。

开发原则：

严禁逻辑重复：在写新功能前，必须检索 src/components 和 src/hooks。如果已有类似功能，必须复用，禁止新建文件。

保持 UI 一致性：所有颜色、间距必须使用 Tailwind CSS 的标准类，不得在代码里写死复杂的 CSS。

状态管理单一化：如果是跨页面的数据（比如单词学习进度），请统一检查项目里是否已经有了全局状态管理（如 Zustand 或 Context），不要在每个页面里单独定义。

必须更新文档：每次修改代码后，请在本项目说明文档中记录你改了哪里，以及为什么要这么改。

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
