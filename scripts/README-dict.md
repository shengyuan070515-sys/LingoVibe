# LingoVibe 词典接入 · 部署指南

这一轮改造把重点词汇的挑选从 "AI 凭直觉" 升级到 "离线词典打分"，同时让视觉词典也优先走词典。底层数据来自 [ECDICT](https://github.com/skywind3000/ECDICT)（MIT 许可证）。

## 一次性准备

### 1. 确保 Vercel 已关联 Neon Postgres
你已完成 ✓

### 2. 把 Neon 环境变量同步到本地
导入脚本只在本地运行一次，需要连接字符串。推荐方式：

```powershell
# 若是第一次在本地用 Vercel CLI
npx vercel link
npx vercel env pull .env.development.local
```

也可以直接从 Vercel Dashboard → Settings → Environment Variables 把 `DATABASE_URL_UNPOOLED`（首选）或 `DATABASE_URL` 的值临时导出到当前 PowerShell：

```powershell
$env:DATABASE_URL_UNPOOLED = "postgres://..."
```

### 3. 跑导入脚本
```powershell
node scripts/build-dict.mjs
```

脚本会：
1. 从 GitHub 下载 ECDICT 源 CSV 到 `scripts/_cache/ecdict.csv`（~50 MB，已加入 `.gitignore`）
2. 按 "对学习者有价值" 规则过滤到约 40-60 K 个词
3. 计算每个词的 `difficulty_level`（1-5）与近似 CEFR 标签
4. 解析屈折变化写入 `dict_exchange`（running→run / saw→see 等映射）
5. 建表 + 批量写入 Neon（每批 500 条，冲突时 UPSERT）

全流程约 1-2 分钟。输出形如：
```
✓ 使用连接字符串：DATABASE_URL_UNPOOLED
✓ 下载完成 52.1 MB，用时 6.3s
→ 解析 CSV
  原始记录：681054 条，耗时 4.1s
✓ 过滤后保留词条 42137 个，屈折映射 108294 条
✓ 建表完成
→ 写入 dict_words（42137 条）
  词条已写入 42137/42137
  用时 48.3s
→ 写入 dict_exchange（108294 条）
  屈折映射已写入 108294/108294
  用时 71.2s
✓ 导入完成：dict_words=42137，dict_exchange=108294
  按难度分布：
    1: 3218
    2: 7851
    3: 9604
    4: 11203
    5: 10261
```

### 4. 验证
回到 Vercel → Storage → Neon Postgres → Query，随便跑：
```sql
SELECT word, difficulty_level, cefr, tag, translation_zh
FROM dict_words
WHERE word IN ('serendipity', 'ephemeral', 'run');
```
能看到数据就说明导入成功。

### 5. 清一次 KV 缓存（让旧精选重新生成）
在 Vercel → Storage → KV Store → 把 `reading:featured:bundle:YYYY-MM-DD` 开头的 key 删掉，或者等明天 Cron 自动跑一轮。

---

## 日常运维

### 词表更新
ECDICT 偶尔会更新。想重新拉一次：
```powershell
# 清掉本地缓存
Remove-Item scripts/_cache/ecdict.csv
# 重新跑，可选 --reset 清空旧数据
node scripts/build-dict.mjs --reset
```

### 本地缓存损坏 / 网络环境差
手动下载 [ECDICT release zip](https://github.com/skywind3000/ECDICT/releases)，解压后把 `ecdict.csv` 放到 `scripts/_cache/ecdict.csv`，然后：
```powershell
node scripts/build-dict.mjs --local
```

### 查看/清理数据
```sql
-- 按难度统计
SELECT difficulty_level, COUNT(*) FROM dict_words GROUP BY 1 ORDER BY 1;

-- 查某档的样本
SELECT word, translation_zh FROM dict_words WHERE difficulty_level = 4 ORDER BY coca_rank NULLS LAST LIMIT 30;

-- 清空重建（会让线上阅读暂时走 AI 兜底几分钟）
TRUNCATE dict_words, dict_exchange;
```

---

## 工作原理回顾

```
用户点开"自选主题" → 生成
        ↓
  DeepSeek 生成文章正文 + 测验（不再负责挑词）
        ↓
  Postgres: tokenize → 过滤停用词/专有名词 → 批量查词典
        ↓
  打分：难度匹配 + 考试标签 + 出现频率 → 贪心去冗余
        ↓
  DeepSeek 给选定的词写新例句 + 中文翻译
        ↓
  返回完整文章（含重点词汇卡片）
```

### 若 Neon 暂时不可用
`generateLearningArticle` 会自动回退到旧版单遍流程（AI 自行挑词），线上不会挂。日志里会看到 `[reading-article-generate] dict pipeline failed, falling back`。

### 视觉词典
用户划词时：`/api/dict-lookup` 并行于原 AI 查词请求发起。词典命中时用它的 `phonetic / pos / 中文释义` 覆盖 AI 结果，但例句仍由 AI 产出（文中上下文需要）。失败也无感。

---

## 未来可选增强

- **CEFR-J 叠加**：用 CEFR-J 真实词表替换当前"从 ECDICT 标签推导"的 cefr 字段，分级更精确。方法：加一个 `scripts/build-cefrj.mjs` 脚本，UPSERT `cefr` 列即可（`dict_words` 主键是 `word`）。
- **词频更新**：用户如果非常想贴近当下语料，可以定期从 COCA/BNC 拉最新频次更新 `coca_rank` / `bnc_rank`。
- **例句批量预生成**：离线跑一轮 AI 给每个词预生成例句入表，线上完全不用调 AI。适合词库规模稳定、想省成本时做。
