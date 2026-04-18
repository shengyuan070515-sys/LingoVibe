# Mobile Responsive Design Guidelines

> **LingoVibe — 移动端适配规范**
> 版本：v1.0 · 2026-04-18
> 状态：草稿待 Review，本轮不改代码

---

## 1. 现状扫描：移动端适配覆盖度

### 1.1 扫描方法

统计 `src/pages/*.tsx` 及 `src/components/**/*.tsx` 中
Tailwind 响应式前缀 `sm:` / `md:` / `lg:` / `xl:` 的出现次数，结合布局结构、
viewport 单位、触摸区域、横向溢出等维度给出评分。

**评级标准：**

| 星级 | 含义 |
|------|------|
| ⭐⭐⭐ | sm + md + lg（或 xl）全覆盖，结构完整 |
| ⭐⭐ | sm + md 或 sm + lg，已有实质适配但有缺口 |
| ⭐ | 仅 sm，或仅 1–2 个断点，整体适配不完整 |
| — | 0–2 个响应式前缀，基本无适配 |

### 1.2 页面覆盖度表

| 页面文件 | sm: | md: | lg: | xl: | 合计 | 评级 | 主要问题 |
|----------|-----|-----|-----|-----|------|------|----------|
| `Settings.tsx` | 1 | 0 | 0 | 0 | 1 | — | 完全无适配，布局在移动端会错乱 |
| `LearningStats.tsx` | 2 | 0 | 0 | 0 | 2 | — | 图表/热力图横向溢出，无适配 |
| `Achievements.tsx` | 2 | 0 | 1 | 0 | 3 | ⭐ | 仅有 grid 基础，无内容层适配 |
| `ReadingArticle.tsx` | 2 | 0 | 2 | 0 | 4 | ⭐ | 核心流程页，fixed z-fighting，无 md |
| `Courses.tsx` | 5 | 0 | 0 | 0 | 5 | ⭐ | 仅 sm，无 md/lg，卡片布局不完整 |
| `DailyReading.tsx` | 4 | 1 | 0 | 0 | 5 | ⭐ | 抽屉未治理，text-[10px] 密集 |
| `CourseDetail.tsx` | 11 | 0 | 2 | 0 | 13 | ⭐⭐ | sm 密集但完全缺少 md 断点 |
| `AiChat.tsx` | 7 | 8 | 0 | 0 | 15 | ⭐⭐ | 无 lg，calc(vh) 在 iOS 键盘弹起时错位 |
| `Dashboard.tsx` | 7 | 4 | 8 | 0 | 19 | ⭐⭐ | 组件层（Heatmap、快捷入口）需打磨 |
| `WordBank.tsx` | 21 | 3 | 1 | 0 | 25 | ⭐⭐ | sm 过重，md/lg 稀薄，触摸区不达标 |
| `FlashcardReview.tsx` | 11 | 5 | 4 | 0 | 20 | ⭐⭐⭐ | 整体结构健康，细节需打磨 |
| `VisualDictionary.tsx` | 5 | 2 | 7 | 8 | 22 | ⭐⭐⭐ | 覆盖最全，xl 侧边栏已处理 |

### 1.3 全局共性问题速览

| 问题类型 | 数量 | 涉及文件 |
|----------|------|----------|
| `text-[10px]` 硬编码 | 12+ | Courses, CourseDetail, DailyReading, FlashcardReview, ReadingArticle + ActivityHeatmap 等 |
| `text-[11px]` 硬编码 | 15+ | 几乎所有页面和关键组件 |
| `text-[9px]` 硬编码 | 2 | ActivityHeatmap（最小，不可接受）|
| `calc(vh)` 未用 dvh/svh | 11 | AiChat, WordBank, ReadingArticle, FlashcardReview, Dashboard |
| 交互元素 h-7/h-8（28–32px） | 18+ | WordBank, AiChat, ReadingArticle, DailyReading |
| 全大写装饰文字未响应式隐藏 | 9+ | dashboard-daily-loop, dashboard-quick-actions, dashboard-todays-mood, visual-dictionary-card-body 等 |
| `env(safe-area-inset-bottom)` 覆盖不完整 | — | 仅 mobile-tab-bar、selection-insight-panel、App.tsx root 使用；页面内容层未保护 |
| 根元素无 `overflow-x-hidden` | — | index.css, index.html 均未设置 |

---

## 2. 全局规范

### 2.1 Tailwind 断点语义约定

```
sm  (≥640px)  — 手机横屏 / 大屏手机（iPhone Pro Max 竖屏）
md  (≥768px)  — 平板竖屏 / 小平板；同时是 sidebar 显示 / MobileTabBar 隐藏的分界线
lg  (≥1024px) — 笔记本 / 平板横屏；多栏布局生效
xl  (≥1280px) — 宽屏桌面；xl: 仅用于 VisualDictionary 侧边栏等真正需要宽屏空间的场景
```

**使用原则：**
- 默认（无前缀）= 移动端样式，**永远从移动端开始写**
- `sm:` 用于「手机横屏稍宽」的微调，不应承载重大布局变化
- `md:` 是主要的「移动端 ↔ 桌面端」切换断点（sidebar 就在此切换）
- `lg:` 用于多栏扩展（2 列 → 3 列、侧边栏固定显示）
- 不允许跳过断点：如果 lg: 改变了布局，必须确认 md: 也有对应的中间状态

### 2.2 最小字号规范

```
禁止使用：text-[9px]  text-[10px]  text-[11px]
正文最小：text-sm  (14px)
辅助说明、标签、徽章：text-xs  (12px)
特殊情况（图表内部刻度）：允许使用 text-[11px] 但必须 hidden md:block，
                           移动端用 text-xs 替代
```

**迁移示例：**
```tsx
// 修改前
<span className="text-[10px] uppercase tracking-widest">LEVEL</span>

// 修改后
<span className="text-xs uppercase tracking-widest">LEVEL</span>
```

### 2.3 最小触摸区域（44×44px）

所有可交互元素必须满足 Apple HIG / WCAG 2.5.5 标准的 44×44px 最小触摸区域。

```tsx
// 图标按钮（icon 本身可以小，但容器必须够大）
<button className="h-11 w-11 flex items-center justify-center">
  <Icon className="h-5 w-5" />
</button>

// 如果不能改变按钮尺寸，用 padding 补足
<button className="p-2.5">  {/* 2.5 * 4 = 10px padding, h-6 icon = 24 + 20 = 44px */}
  <Icon className="h-6 w-6" />
</button>
```

**当前违规清单：**
- `h-7`（28px）: WordBank 过滤按钮、AiChat 附件按钮、reading-vocab-cards
- `h-8`（32px）: WordBank、DailyReading、ReadingArticle 多处图标按钮
- `h-9`（36px）: VisualDictionary 操作按钮、micro-lesson-chat 麦克风按钮

### 2.4 视口单位规范

**优先级：** `svh` > `dvh` > `100%` > `vh`（禁止在顶层高度计算中裸用 `vh`）

| 单位 | 含义 | 适用场景 |
|------|------|----------|
| `svh` | Small Viewport Height（最小视口，含工具栏） | 固定高度容器、全屏页面，最安全 |
| `dvh` | Dynamic Viewport Height（随工具栏动态变化） | 聊天页、阅读页等需要「填满剩余空间」的场景 |
| `lvh` | Large Viewport Height（最大视口，不含工具栏） | 仅用于桌面端（`md:` 前缀后） |
| `vh` | 旧版（iOS Safari 工具栏不计入，布局会跳动） | **禁止在移动端顶层使用** |

```tsx
// 修改前（iOS Safari 键盘弹起时布局跳动）
<div className="h-[calc(100vh-5.5rem)]">

// 修改后
<div className="h-[calc(100dvh-5.5rem)]">

// 全屏页面首选
<div className="min-h-[100svh]">
```

### 2.5 水平滚动治理

**根元素层（全局，在 `src/index.css` 中设置）：**
```css
html, body {
  overflow-x: hidden;
}
```

**规则：**
- `overflow-x-hidden`：挂在 `html` + `body`，防止任何子元素导致全页横向滚动
- `overflow-x-auto`：只允许在有 **明确 `max-w` 约束** 的容器内使用（如 ActivityHeatmap）
- 禁止在 page 根 `<div>` 上设 `overflow-x-auto` 而不限制宽度

```tsx
// ActivityHeatmap 正确用法
<div className="w-full overflow-x-auto">
  <div className="min-w-[600px]">  {/* 明确最小宽度 */}
    ...
  </div>
</div>
```

### 2.6 Grid 标准阶梯

```tsx
// 标准三档阶梯（默认）
className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3"

// 紧凑卡片（如成就、课程）
className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4"

// 仪表盘主区（12 列 spanning）
className="grid grid-cols-12"
// 子元素: col-span-12 md:col-span-6 lg:col-span-4

// 禁止：grid-cols-1 lg:grid-cols-3（跳过了 md 中间态）
```

### 2.7 全大写英文装饰标签的处理

当前问题：`uppercase tracking-[0.18em]` 的英文装饰标签（如 "DAILY LOOP"、"QUICK ACTIONS"）
在中文移动端用户的 375px 屏上占用大量横向空间，且可读性差。

**规范：**
```tsx
// 方案 A：移动端隐藏，桌面端显示
<span className="hidden md:inline uppercase tracking-wider text-xs">
  QUICK ACTIONS
</span>

// 方案 B：移动端用中文/短标签，桌面端用英文装饰
<span className="md:hidden text-sm font-medium">快速入口</span>
<span className="hidden md:inline uppercase tracking-wider text-xs opacity-60">
  QUICK ACTIONS
</span>
```

**当前需要处理的组件：**
- `dashboard-daily-loop.tsx`: `uppercase tracking-[0.18em]`
- `dashboard-quick-actions.tsx`: `uppercase tracking-[0.18em]`
- `dashboard-todays-mood.tsx`: `uppercase tracking-[0.22em]`
- `visual-dictionary-card-body.tsx`: `uppercase tracking-widest`
- `reading-word-card-modal.tsx`: `uppercase tracking-[0.2em]`
- `word-detail-modal.tsx`: `uppercase tracking-[0.2em]`

### 2.8 头部高度预算

移动端（< `md:`）头部高度不得超过视口高度的 25%（375×667 屏上约为 167px）。

**实际限制：**
- 页面级 sticky header：使用 `h-14`（56px）或最多 `h-16`（64px）
- 如果 header 内有多行内容（标题 + 副标题），副标题在移动端必须 `hidden md:block`
- App.tsx 中已有 `sticky top-0` header，各页面不应再叠加第二个 sticky header

```tsx
// 正确：单层 header
<header className="sticky top-0 z-30 h-14 md:h-16 flex items-center px-4">

// 错误：在页面内再叠一层 sticky header
<div className="sticky top-14 z-20 ...">  {/* 会在 header 下方再占一块空间 */}
```

### 2.9 移动端隐藏元素清单

以下元素在移动端（< `md:`）应隐藏或替换：

| 元素 | 位置 | 移动端处理 | 备注 |
|------|------|-----------|------|
| 侧边导航栏 AppSidebar | `sidebar.tsx` | 已 `md:hidden` ✓ | 由 MobileTabBar 替代 |
| ActivityHeatmap 完整视图 | `LearningStats.tsx` | 需改为 `hidden md:block`，移动端显示简化版 | 当前横向溢出 |
| VocabularyGrowthChart | `LearningStats.tsx` | 需在移动端限制高度 `max-h-[200px]` | 当前无断点 |
| 仪表盘英文副标题 | `Dashboard.tsx` 各组件 | `hidden md:inline` | 7+ 处 |
| ReadingArticle 侧边词汇面板 | `ReadingArticle.tsx` | 移动端改为底部抽屉 | 当前 fixed 定位未适配 |
| VisualDictionary 左侧列表抽屉 | `VisualDictionary.tsx` | 已有 `lg:static`，md 以下为 fixed 抽屉 ✓ | 需确认关闭按钮 ≥44px |
| DailyReading 右侧过滤抽屉 | `DailyReading.tsx` | 当前 `xl:hidden` 太保守，应改 `md:hidden` | 平板也应为侧边栏 |
| MasteryRadarChart | `LearningStats.tsx` | 移动端限制 `max-w-[280px] mx-auto` | 当前 `h-64 w-64` 无响应 |

### 2.10 深色模式在移动端的处理

**规范：所有新增或修改的响应式规则，必须同步补全 `dark:` 变体。**

```tsx
// 新增移动端规则时的完整写法模板
className="
  bg-white text-gray-900           /* 移动端浅色 */
  dark:bg-gray-900 dark:text-white /* 移动端深色 */
  md:bg-gray-50                    /* 桌面端浅色 */
  md:dark:bg-gray-800              /* 桌面端深色 */
"
```

**常见遗漏：**
- 移动端专用的遮罩层：`bg-black/50` 需要确认深色模式下对比度
- 底部抽屉背景：`bg-white md:bg-transparent` 类型，深色模式需对应 `dark:bg-gray-900`
- iOS Safari 状态栏颜色：`index.html` 中 `theme-color` 目前只有一个值，
  需添加 `media="(prefers-color-scheme: dark)"` 版本

### 2.11 iOS Safari 兼容要点

#### a) 键盘弹起（Virtual Keyboard）
iOS Safari 键盘弹起时会缩小 `window.innerHeight`，但不触发 resize 事件（旧版行为）。

```tsx
// AiChat 等输入页面的高度计算必须用 dvh
// 修改前：键盘弹起时输入框被推到屏幕外
<div className="h-[calc(100vh-5.5rem)]">

// 修改后：dvh 跟随键盘动态调整
<div className="h-[calc(100dvh-5.5rem)]">
```

#### b) 底部安全区域（Home Indicator / Notch）
```tsx
// 所有 fixed bottom-0 元素必须添加安全区域 padding
<div className="fixed bottom-0 pb-[env(safe-area-inset-bottom,0px)]">

// MobileTabBar 已正确处理：
// pb-[max(0.5rem,env(safe-area-inset-bottom,0px))]  ✓

// 待补齐：ReadingArticle fixed bottom toolbar、DailyReading 底部按钮
```

#### c) `position: fixed` 在 iOS Safari 的已知 Bug
- iOS 15 以下：`position: fixed` 元素在键盘弹起时位置错误
- 缓解方案：对聊天输入区域使用 `position: sticky` 配合 flex 布局替代 fixed

```tsx
// AiChat 推荐结构
<div className="flex flex-col h-[100dvh]">
  <header className="flex-none ...">...</header>
  <main className="flex-1 overflow-y-auto min-h-0">...</main>
  <footer className="flex-none pb-[env(safe-area-inset-bottom,0px)]">
    {/* 输入框 */}
  </footer>
</div>
```

#### d) `@supports` 渐进增强
```css
/* 在 index.css 中添加，为不支持 dvh 的旧版 Safari 提供回退 */
.h-screen-dynamic {
  height: 100vh; /* fallback */
}
@supports (height: 100dvh) {
  .h-screen-dynamic {
    height: 100dvh;
  }
}
```

---

## 3. 治理路线图

### 分级标准
- 🔴 **Red（0–1★）**：移动端基本不可用，需要重构布局
- 🟡 **Yellow（2★）**：主体可用但有明显痛点，需补齐断点和触摸规范
- 🟢 **Green（3★）**：结构健康，需打磨细节

### 修复顺序（按「用户触达频率 × 损坏程度」优先）

---

#### 🔴 第一批：Red — 需要重构

**修复顺序 & 理由：**

| 优先级 | 页面 | 频率 | 损坏程度 | 核心问题 |
|--------|------|------|----------|----------|
| P1 | **DailyReading** | 每日核心功能 | 高 | `text-[10px]` 密集（9 处）、右侧抽屉 `xl:hidden`（平板上一直显示）、无 lg 断点 |
| P2 | **ReadingArticle** | 每篇文章打开 | 高 | SelectionInsightPanel fixed 定位 z-fighting、sticky header 双层堆叠、无 md 断点 |
| P3 | **Courses** | 学习入口 | 中 | 仅 sm，课程卡无 md/lg 多列布局，筛选 tab 溢出 |
| P4 | **Settings** | 低频但必访 | 高 | 几乎无适配，表单布局在 375px 会错乱 |
| P5 | **LearningStats** | 周期性查看 | 高 | ActivityHeatmap 横向溢出，图表无尺寸约束 |
| P6 | **Achievements** | 低频 | 中 | 布局简单，但卡片尺寸和星级显示在移动端不规范 |

---

#### 🟡 第二批：Yellow — 需要补齐

| 优先级 | 页面 | 核心缺口 |
|--------|------|----------|
| P7 | **AiChat** | 无 lg 断点；`calc(100vh/dvh)` 混用；iOS 键盘弹起布局跳动；h-7/h-8 按钮 |
| P8 | **WordBank** | sm 覆盖过重（21 处）但 md/lg 仅 4 处；触摸区多处 h-7/h-8；横向溢出风险 |
| P9 | **CourseDetail** | sm 11 处但 md 为 0；平板布局完全缺失；英文装饰标签未处理 |
| P10 | **Dashboard** | 结构合理，但 ActivityHeatmap 组件、dashboard-quick-actions 装饰文字需打磨 |

---

#### 🟢 第三批：Green — 需要打磨

| 优先级 | 页面 | 打磨方向 |
|--------|------|----------|
| P11 | **FlashcardReview** | `text-[10px]` × 3 处替换；翻牌手势区域触摸优化 |
| P12 | **VisualDictionary** | 关闭按钮触摸区核查；深色模式抽屉背景补全 |

---

### 并行组件专项（与页面修复同步进行）

以下组件跨多个页面使用，需要独立修复后在所有使用处验证：

| 组件 | 问题 | 影响页面 |
|------|------|----------|
| `ActivityHeatmap.tsx` | `text-[9px]`/`text-[10px]`，无响应式，横向溢出 | LearningStats |
| `VocabularyGrowthChart.tsx` | `text-[10px]`，无断点，`max-h-[280px]` 固定 | LearningStats |
| `MasteryRadarChart.tsx` | `text-[11px]`，`h-64 w-64` 固定，不响应 | LearningStats |
| `MicroLessonChat.tsx` | `text-[10px]`/`text-[11px]`，`max-h-[min(52vh,420px)]` 用 svh | Dashboard |
| `SelectionInsightPanel.tsx` | iOS fixed 定位，深色模式背景，safe-area 覆盖不完整 | ReadingArticle |
| `reading-vocab-cards.tsx` | `text-[10px]`，h-7 按钮 | ReadingArticle |

---

## 4. 验收清单（真机逐页检查）

> 测试设备基准：**375px 宽 × 667px 高**（iPhone SE / iPhone 8 尺寸）
> 浏览器：iOS Safari（主测）+ Android Chrome（交叉验证）
> 每项均为明确的 **通过 / 不通过** 判定。

---

### Dashboard（仪表盘）⭐⭐

- [ ] **1.** 页面首屏（不滚动）能看到 "每日任务" 卡片和至少 2 个快捷入口按钮
- [ ] **2.** "DAILY LOOP" / "QUICK ACTIONS" 等全大写英文标签在 375px 下不会造成卡片文字溢出（文字不超出卡片边界）
- [ ] **3.** ActivityHeatmap 区域有水平滚动指示（如渐变遮罩或滚动条），且页面整体不出现横向滚动条
- [ ] **4.** 快捷入口按钮（4 个图标按钮）用手指点击，每个的点击热区 ≥ 44×44px（可用 DevTools → 触摸模拟验证）
- [ ] **5.** MoodTracker 卡片内最小文字（如"今日心情"标签）不小于 12px

---

### AiChat（AI 对话）⭐⭐

- [ ] **1.** 在 375px 下，点击输入框唤起虚拟键盘后，输入框仍然可见（不被键盘遮挡）
- [ ] **2.** 发送按钮的可点击区域 ≥ 44×44px（包括 padding）
- [ ] **3.** 对话气泡中最长的消息文本不会超出屏幕右侧（无横向滚动条）
- [ ] **4.** 底部输入区域距屏幕底部边缘留有安全边距（iPhone 有 Home Indicator 时不被遮挡）
- [ ] **5.** 滚动到历史消息顶部后，再点击"滚动到底部"按钮，页面能正确回到最新消息

---

### WordBank（词库）⭐⭐

- [ ] **1.** 顶部搜索栏和过滤标签在 375px 下完整可见（无任何元素被截断或溢出到屏幕外）
- [ ] **2.** 词汇卡片列表以单列展示，每张卡片能展示单词 + 音标 + 释义前两行
- [ ] **3.** "添加单词" 或主要操作按钮高度 ≥ 44px
- [ ] **4.** 过滤标签（词性/等级标签）在多个标签时正确换行，不出现横向溢出
- [ ] **5.** 点击词汇卡片后，词汇详情弹出层（WordDetailModal）全屏覆盖，关闭按钮 ≥ 44×44px 且可见

---

### FlashcardReview（闪卡复习）⭐⭐⭐

- [ ] **1.** 闪卡主体在 375px 下占屏幕高度的 55%–80%（闪卡不过小也不超出屏幕）
- [ ] **2.** 点击翻转区域后卡片正常翻面（不需要精确点击某个小按钮，整个卡片区域可点击）
- [ ] **3.** 评分按钮（Again / Hard / Good / Easy）4 个按钮在 375px 下全部可见且不需要滚动
- [ ] **4.** 卡片上的正文/例句文字不超出卡片边界（overflow: hidden 生效）
- [ ] **5.** 顶部进度条/计数（"第 X 张 / 共 Y 张"）在 375px 下完整可见

---

### VisualDictionary（视觉词典）⭐⭐⭐

- [ ] **1.** 左侧词汇列表抽屉通过汉堡按钮打开后，抽屉宽度 ≤ 屏幕宽度的 88%（右侧保留可点击的遮罩区域）
- [ ] **2.** 抽屉内的关闭按钮（×）或遮罩点击能关闭抽屉，关闭按钮 ≥ 44×44px
- [ ] **3.** 主区域词汇图片高度 ≥ 80px（图片不因容器太小而消失）
- [ ] **4.** 搜索输入框在 375px 下未被抽屉或其他元素遮挡，可直接聚焦输入
- [ ] **5.** 发音音频按钮 ≥ 44×44px，点击后有视觉反馈（颜色/状态变化）

---

### Settings（设置）—

- [ ] **1.** 所有设置项（账户、语言、通知等）在 375px 下可以上下滚动到达，无内容被截断
- [ ] **2.** 开关（Toggle）控件高度 ≥ 44px，或其点击热区通过 padding 补齐到 44px
- [ ] **3.** 下拉选择器（语言选择等）在 375px 下能正常打开，选项列表不超出屏幕
- [ ] **4.** 各分组标题（section header）字号 ≥ 14px，不出现文字溢出
- [ ] **5.** 确认/保存按钮在首屏或操作区域内可见（不需要滚动到最底部才能找到）

---

### LearningStats（学习统计）—

- [ ] **1.** ActivityHeatmap 以水平滚动容器展示（不撑开整个页面宽度），且有明确的视觉提示表示可滚动
- [ ] **2.** VocabularyGrowthChart 图表高度 ≤ 200px，纵轴标签文字 ≥ 12px
- [ ] **3.** 统计卡片（总词数/连续学习天数等）在 375px 下以 1–2 列排列，数字和标签完整可见
- [ ] **4.** MasteryRadarChart 雷达图宽度不超出屏幕（自动收缩至容器宽度）
- [ ] **5.** 所有数字和百分比标注字号 ≥ 12px（无 text-[9px] / text-[10px]）

---

### Achievements（成就）⭐

- [ ] **1.** 成就卡片在 375px 下以 2 列排列（不是 3 列挤压，也不是 1 列太稀疏）
- [ ] **2.** 成就徽章图标 ≥ 44×44px 可点击区域（若有详情交互）
- [ ] **3.** "已解锁"与"未解锁"状态在移动端视觉上明显区分（不依赖 hover 状态）
- [ ] **4.** 进度条在 375px 下高度 ≥ 4px，可见
- [ ] **5.** 成就标题文字单行或两行内截断（不会超出卡片边界）

---

### ReadingArticle（阅读文章）⭐

- [ ] **1.** 文章正文字号 ≥ 16px（iOS Safari 默认阅读字号），行高适合移动端阅读
- [ ] **2.** 长按/选中单词后，弹出的 SelectionInsightPanel 出现在被选文字的上方或下方，**不遮挡**文字本身
- [ ] **3.** SelectionInsightPanel 底部抽屉不超过屏幕高度的 70%，仍可看到文章部分内容
- [ ] **4.** 返回按钮（导航回上一页）≥ 44×44px
- [ ] **5.** 文章标题在 sticky header 中最多显示 2 行（超出截断），不撑高 header

---

### Courses（课程列表）⭐

- [ ] **1.** 课程卡片在 375px 下以单列展示（1 column），封面图不变形
- [ ] **2.** 课程封面图维持 16:9 比例（不出现上下压缩或拉伸）
- [ ] **3.** "开始学习" / "继续学习" 按钮高度 ≥ 44px
- [ ] **4.** 顶部分类 Tab 在标签较多时横向滚动（不换行也不截断）
- [ ] **5.** 课程进度条在 375px 下可见（高度 ≥ 4px）

---

### DailyReading（每日阅读列表）⭐

- [ ] **1.** 文章卡片在 375px 下以单列展示，标题完整可见（不超出卡片）
- [ ] **2.** "开始阅读" 按钮高度 ≥ 44px，且文字不换行
- [ ] **3.** 难度徽章文字 ≥ 12px，颜色对比度符合 AA 标准
- [ ] **4.** 右侧过滤/分类抽屉通过按钮打开后，有 × 关闭按钮且 ≥ 44×44px
- [ ] **5.** 文章预计阅读时间标签在首屏卡片上直接可见（不需要展开或 hover）

---

### CourseDetail（课程详情）⭐⭐

- [ ] **1.** 课程封面图/横幅高度在 375px 下 ≤ 屏幕高度的 40%（不占据大半首屏）
- [ ] **2.** 课时列表中每个课时条目的点击热区高度 ≥ 44px
- [ ] **3.** 章节折叠/展开按钮 ≥ 44×44px
- [ ] **4.** "开始本章" CTA 按钮宽度 ≥ 屏幕宽度的 50%（或 full-width）
- [ ] **5.** 课程整体进度百分比数字在 375px 下可见（不被裁剪）

---

## 5. 关键组件速查

> 以下组件被多个页面引用，修复后需在所有引用处回归测试。

| 组件文件 | 当前问题 | 修复优先级 |
|----------|----------|-----------|
| `ActivityHeatmap.tsx` | `text-[9px]`/`text-[10px]`，SVG `fontSize: 9`，无响应式，溢出父容器 | P5（LearningStats）|
| `VocabularyGrowthChart.tsx` | `text-[10px]`，`max-h-[280px]` 固定不响应 | P5（LearningStats）|
| `MasteryRadarChart.tsx` | `text-[11px]`，`h-64 w-64` 固定正方形 | P5（LearningStats）|
| `MicroLessonChat.tsx` | `text-[10px]`/`text-[11px]`，`max-h-[min(52vh,420px)]` 应改 svh | P10（Dashboard）|
| `SelectionInsightPanel.tsx` | iOS fixed 定位兼容性，深色模式底部背景，safe-area 不完整 | P2（ReadingArticle）|
| `reading-vocab-cards.tsx` | `text-[10px]`，`h-7` 按钮 28px | P2（ReadingArticle）|
| `visual-dictionary-card-body.tsx` | `text-[11px]`/`text-[10px]`，uppercase 未响应式处理 | P12（VisualDictionary）|
| `dashboard-quick-actions.tsx` | `uppercase tracking-[0.18em]` 在移动端未隐藏 | P10（Dashboard）|
| `mobile-tab-bar.tsx` | `text-[11px]`/`text-[10px]` Tab 标签，已有 safe-area ✓ | P7（全局）|

---

*文档完。下一步：user review → 确认路线图顺序 → 进入修复轮次（从 DailyReading 开始）。*
