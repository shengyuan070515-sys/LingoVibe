# 每日阅读 · 精选外刊扩展与「每日缓存」改进规格书

**状态**：草案 · **待决议**（未进入实现；与已锁定 v1 规格 [2026-04-04-daily-reading-design.md](./2026-04-04-daily-reading-design.md) 并行演进）  
**撰写目的**：把「精选文章推荐」的数据源、四大类划分、后端缓存与「每日零点」策略写成可评审文档，**等你全部拍板后再写代码**。

---

## 1. 背景与目标

### 1.1 现状（产品意图）

界面文案与卡片体现「AI 每日精选外刊」：**多源、分难度与内容分类、固定网格（如 2×2）**，强调**每日仪式感**，而非「每次刷新换一批」。

### 1.2 本次改进目标

| 编号 | 目标 | 说明 |
|------|------|------|
| G1 | **扩展白名单域名** | 在现有卫报、经济学人、自然、新科学家、国家地理、时代周刊基础上，增加 HBR、Bloomberg、NPR、Vox、Aeon、The Atlantic、Wired、MIT Technology Review 等（**主域名见 §3**）。 |
| G2 | **四大类 × 每日各 1 篇** | 将域名归入 **4 个大类**；**每个自然日**从每个大类中**各选 1 篇**进入「当日精选池」（展示数量与网格布局可另行约定，默认 4 张卡片与 4 类对齐）。 |
| G3 | **缓存与轮换** | 同一自然日内，**多次打开/刷新**应看到**同一组**精选结果（或明确允许的例外，见 §6），以节约 **Tavily / 搜索与抽取** 等 API 额度。 |
| G4 | **后端主导的「日界」** | 「每日更新」由**服务端**根据**约定的日历与日界规则**判定，而非依赖用户浏览器本地日期 alone（避免时区混乱与篡改）。 |

### 1.3 非目标（本改进书不先行承诺）

- 不替代用户主动的「关键词检索入库」主路径；精选为**增量能力**（具体入口与 v1 列表如何并存，见 §8）。
- 不在此文档锁定**付费墙绕过**方案；部分域名正文抽取可能失败，需单独降级策略（§7）。

---

## 2. 架构原则（Superpowers 与当前仓库对齐）

- **前端**：Vite SPA，继续负责文章库、阅读器、闭环逻辑（与现有 `readingLibraryStore` 等一致）。
- **后端**：延续 **Vercel Serverless（`api/`）** 形态；新增「精选编排 + 持久化或半持久化缓存」层（具体存储选型 §5）。
- **密钥**：联网搜索已迁移 **Tavily**（`TAVILY_API_KEY` 仅服务端）；精选流水线若复用搜索，**不得**把 Key 暴露到浏览器。
- **规格与实现分离**：本文仅锁**行为与决策点**；通过后再新增/更新 `docs/superpowers/plans/` 中的分步实现计划。

---

## 3. 数据源：主域名清单（工程白名单建议）

以下为**站点主域**（搜索 `site:` 或 allowlist 校验时使用；子域如 `www.` 可在实现中归一化）：

| 出版物 | 建议主域 | 备注 |
|--------|-----------|------|
| The Guardian | `theguardian.com` | 现有文案已含 |
| The Economist | `economist.com` | 部分文章付费 |
| Nature | `nature.com` | |
| New Scientist | `newscientist.com` | |
| National Geographic | `nationalgeographic.com` | |
| TIME | `time.com` | |
| Harvard Business Review | `hbr.org` | 常含付费墙 |
| Bloomberg | `bloomberg.com` | 常含付费墙 |
| NPR | `npr.org` | |
| Vox | `vox.com` | |
| Aeon | `aeon.co` | 长文人文向 |
| The Atlantic | `theatlantic.com` | 付费墙常见 |
| Wired | `wired.com` | |
| MIT Technology Review | `technologyreview.com` | |

**决议项 D1**：是否仅允许上表域名进入「精选池」，还是允许「主域 + 明确列出的子域」？

**决议项 D2**：付费/硬站点的策略——**仅推荐可抽取 URL**、**允许卡片但点击后原文失败提示**、或 **从大类候选中自动跳过连续失败域**？

---

## 4. 四大类划分（待商议：多套方案）

原则：**每个域名只属于一个大类**（避免同一日在多类重复计篇）；若业务上必须允许跨类，需在计划中写明去重键（建议仍以 **canonical URL** 为全局去重）。

### 方案 A — 按「认知场景」四分（推荐讨论起点）

| 大类（中文） | 英文标签（UI 可用） | 建议归入域名 |
|--------------|---------------------|--------------|
| **全球时事与政策** | News & World | theguardian.com, time.com, npr.org, vox.com, theatlantic.com, economist.com（若与 B 冲突则二选一） |
| **科学与探索** | Science & Discovery | nature.com, newscientist.com, nationalgeographic.com |
| **科技与产业** | Technology & Industry | wired.com, technologyreview.com |
| **商业与管理** | Business & Work | hbr.org, bloomberg.com, economist.com |

> **冲突点**：Economist、Bloomberg、Atlantic 既可属「新闻」也可属「商业」。需你选定**唯一归属**。

### 方案 B — 强调「观点 / 深度」独立一类

| 大类 | 域名示例 |
|------|-----------|
| 硬新闻快讯 | guardian, npr, time |
| 深度评论与观点 | economist, atlantic, vox |
| 科学与自然 | nature, newscientist, nationalgeographic |
| 科技与商业 | wired, technologyreview, hbr, bloomberg |

### 方案 C — 「通识人文」独立（适合 Aeon）

单独把 **Aeon** 与部分 Atlantic / New Yorker 类（若未来扩展）放入 **Ideas & Culture**，与「科技」「商业」并列；则「科学」更纯。

**决议项 D3**：选定 **A / B / C** 或提供你的四分命名 + 每类域名表（可在此文档直接改表锁定）。

---

## 5. 「缓存与轮换」机制（工程选项，供拍板）

### 5.1 核心数据模型（逻辑）

建议服务端维护一条**当日精选记录**（概念模型）：

```text
dateKey: "YYYY-MM-DD"        // 按 §6 选定时区切日
tz: "Asia/Shanghai"           // 或 UTC，须显式锁定
slots: [
  { categoryId, sourceDomain, title, url, snippet?, difficultyBand?, fetchedAt }
]                            // 长度 = 4，与四大类一一对应
version: number               // 便于迁移
```

**客户端行为**：读取**只读接口**（如 `GET /api/reading-featured-daily`）展示卡片；**不在每次刷新时触发 Tavily 全量搜索**。

### 5.2 存储选型（与 Vercel 常见组合）

| 选项 | 优点 | 缺点 |
|------|------|------|
| **S1 — Vercel KV / Upstash Redis** | 按 `dateKey` 读写快，适合每日键 | 需额外服务与费用 |
| **S2 — Vercel Blob 单 JSON** | 实现简单，成本低 | 并发写需小心；冷启动略慢 |
| **S3 — Postgres / Vercel Postgres** | 可审计历史每日推荐 | 运维与成本略高 |
| **S4 — 无持久化：Cron 写内存**（不推荐） | 无 | Serverless 实例不共享，**不可用** |

**决议项 D4**：选定 S1–S3（或组合：KV 存当日 + Blob 存归档）。

### 5.3 何时写入缓存（生成当日四条）

| 触发 | 说明 |
|------|------|
| **T1 — 定时 Cron** | Vercel Cron 在每日 **00:05**（按选定 TZ）调用 `POST /api/internal/refresh-featured`（需 `CRON_SECRET`），顺序：四大类各执行一次受控搜索 → 选 URL → 可选预拉 snippet（**不必**全文入库）。 |
| **T2 — 懒生成（首请求）** | 当日第一次 `GET` 发现无 `dateKey` 或过期 → 同步或后台生成后返回；需**分布式锁**或「单日单飞」避免并发打爆 API。 |
| **T3 — 混合** | Cron 为主；GET 发现缺失时兜底生成一次。 |

**决议项 D5**：选定 T1 / T2 / T3。

---

## 6. 「零点更新」语义（必须显式锁定）

**决议项 D6 — 日界与时区**

- **推荐默认**：`Asia/Shanghai` 自然日 `00:00:00` 切换 `dateKey`（与多数国内用户直觉一致）。
- **备选**：UTC `00:00`（实现简单，但与本地「每日」体验可能错位）。
- **进阶**：用户设置里选择时区（复杂度高，可列为 v2）。

**决议项 D7 — 「更新」的可见时刻**

- Cron 若在 `00:05` 跑完，则 `00:00–00:05` 可能仍显示昨日缓存；可接受则写进文案，或把 Cron 提前到 `23:55` 预生成「次日」键（逻辑上易错，需谨慎）。

---

## 7. 流水线与 API 消耗（粗粒度）

1. **按类选域**：从该类白名单随机或轮询起点（**决议项 D8**：随机 vs 轮询，避免总打同一域）。
2. **搜索**：Tavily `query` 例如 `site:theguardian.com international` 或预置主题词表（**决议项 D9**：主题词由运营表配置还是 LLM 生成）。
3. **过滤**：仅保留 allowlist 内 URL；去重；可选 `reading-extract` 试抽失败则换候选（**决议项 D10**：最多尝试次数）。
4. **难度/分类展示**：沿用现有 Band 与 UI 分类逻辑，或改为完全由服务端字段驱动（**决议项 D11**）。

---

## 8. 与现有「每日阅读」页面的关系

现有 v1：**用户搜索/导入** 驱动文章库。改进后建议：

- **精选区**：只读展示当日四条（或 N 条），按钮「阅读原文」可走**已有入库流程**（打开 URL → extract → 进库）或 **直达阅读器**（若你允许不先进库，则需新规格）。
- **决议项 D12**：精选卡片点击后，是否**强制先入 `readingLibraryStore`**（与去重规则一致），还是允许「临时阅读不落库」？

---

## 9. 安全与运维

- 刷新类接口必须 **`CRON_SECRET` 头**或 Vercel Cron 签名验证，禁止公开随意触发。
- 日志禁止打印 Tavily Key、完整用户 Agent 中的敏感信息。
- 监控：每日生成失败率、各类 fallback 次数。

---

## 10. 决议清单（复制到你的回复里逐项勾选）

- [ ] **D1** 域名白名单范围  
- [ ] **D2** 付费墙站点策略  
- [ ] **D3** 四大类最终划分与每域归属  
- [ ] **D4** 缓存存储（KV / Blob / DB）  
- [ ] **D5** 生成触发（Cron / 懒加载 / 混合）  
- [ ] **D6** 日界时区  
- [ ] **D7** 用户可见的切换时刻与边界文案  
- [ ] **D8** 域内轮换策略  
- [ ] **D9** 搜索主题词来源  
- [ ] **D10** 抽取失败重试次数  
- [ ] **D11** Band/分类由谁计算  
- [ ] **D12** 精选进库策略  

---

## 11. 下一步（你全部决定之后）

1. 将本文 **状态** 改为「已锁定」并注明日期。  
2. 在 `docs/superpowers/plans/` 新增实现计划（API 契约、`env` 变量、`vercel.json` cron、前端组件改造步骤）。  
3. 再按 Superpowers 执行技能分任务实现与测试。

---

**文档版本**：2026-04-04 · 初稿（改进书）
