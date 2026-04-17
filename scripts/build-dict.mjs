#!/usr/bin/env node
/**
 * 词典导入脚本：从 ECDICT 下载 → 过滤 → 批量写入 Neon Postgres。
 *
 * 用法（Windows PowerShell）：
 *   # 1. 从 Vercel 同步环境变量到本地 .env.development.local（首次）：
 *   #    npx vercel link
 *   #    npx vercel env pull .env.development.local
 *   #
 *   # 2. 运行导入（首次会下载 ~50MB 的 ECDICT CSV）：
 *   node scripts/build-dict.mjs
 *
 *   # 若网络下载失败，也可以先手动下载 ecdict.csv 到 scripts/_cache/ecdict.csv，
 *   # 然后用 --local 参数跳过下载：
 *   node scripts/build-dict.mjs --local
 *
 *   # 强制重新建表（清空已有数据）：
 *   node scripts/build-dict.mjs --reset
 *
 * 数据源：
 *   ECDICT (https://github.com/skywind3000/ECDICT) — MIT 许可证。
 *
 * 备注：
 *   CEFR-J 叠加为未来可选增强；当前版本直接从 ECDICT 标签推导近似 CEFR 等级。
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { neon } from '@neondatabase/serverless';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = join(__dirname, '_cache');
const CACHE_CSV = join(CACHE_DIR, 'ecdict.csv');
const ECDICT_URL = 'https://raw.githubusercontent.com/skywind3000/ECDICT/master/ecdict.csv';

const args = new Set(process.argv.slice(2));
const USE_LOCAL = args.has('--local');
const RESET = args.has('--reset');

/* ------------------------------- 环境变量 ------------------------------- */

function loadDotEnv() {
    /** 兼容 Next-style `.env.development.local` / `.env.local` / `.env` */
    const candidates = ['.env.development.local', '.env.local', '.env'];
    for (const name of candidates) {
        const p = join(process.cwd(), name);
        if (!existsSync(p)) continue;
        const txt = readFileSync(p, 'utf8');
        for (const line of txt.split(/\r?\n/)) {
            const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
            if (!m) continue;
            if (m[1] in process.env) continue;
            let v = m[2];
            if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
                v = v.slice(1, -1);
            }
            process.env[m[1]] = v;
        }
    }
}

loadDotEnv();

function pickConnectionString() {
    /**
     * 批量导入优先用 unpooled 直连，避免连接池在长时间会话中被回收。
     * 列出了 Neon Integration 可能的所有命名变体（含 POSTGRES_ 前缀版本）。
     */
    const keys = [
        'DATABASE_URL_UNPOOLED',
        'POSTGRES_URL_NON_POOLING',
        'POSTGRES_DATABASE_URL_UNPOOLED',
        'POSTGRES_URL_NO_SSL',
        'DATABASE_URL',
        'POSTGRES_URL',
        'POSTGRES_DATABASE_URL',
        'POSTGRES_PRISMA_URL',
    ];
    for (const k of keys) {
        const v = process.env[k];
        if (v && v.trim()) return { key: k, value: v.trim() };
    }
    return null;
}

const conn = pickConnectionString();
if (!conn) {
    console.error('✗ 找不到数据库连接字符串。');
    console.error('  请先运行 `npx vercel env pull .env.development.local` 拉取 Neon Postgres 的环境变量，');
    console.error('  或在当前 shell 中设置 DATABASE_URL / POSTGRES_URL / DATABASE_URL_UNPOOLED 之一。');
    process.exit(1);
}
console.log(`✓ 使用连接字符串：${conn.key}`);

const sql = neon(conn.value);

/* --------------------------------- 下载 --------------------------------- */

async function ensureCsv() {
    if (USE_LOCAL) {
        if (!existsSync(CACHE_CSV)) {
            console.error(`✗ --local 模式下找不到 ${CACHE_CSV}，请先手动放好 ECDICT CSV。`);
            process.exit(1);
        }
        console.log(`✓ 使用本地缓存：${CACHE_CSV}`);
        return;
    }

    if (existsSync(CACHE_CSV)) {
        const size = statSync(CACHE_CSV).size;
        if (size > 10_000_000) {
            console.log(`✓ 已有缓存 ${CACHE_CSV}（${(size / 1024 / 1024).toFixed(1)} MB），跳过下载`);
            return;
        }
        console.log('缓存文件可疑，重新下载');
    }

    if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });

    console.log(`→ 下载 ECDICT：${ECDICT_URL}`);
    const t0 = Date.now();
    const r = await fetch(ECDICT_URL);
    if (!r.ok) {
        console.error(`✗ 下载失败 HTTP ${r.status}。`);
        console.error('  备选方案：手动下载 https://github.com/skywind3000/ECDICT/releases 里的 zip，');
        console.error(`  解压后把 ecdict.csv 放到 ${CACHE_CSV}，然后用 --local 运行。`);
        process.exit(1);
    }
    const buf = Buffer.from(await r.arrayBuffer());
    writeFileSync(CACHE_CSV, buf);
    console.log(`✓ 下载完成 ${(buf.length / 1024 / 1024).toFixed(1)} MB，用时 ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

/* ------------------------------ CSV 解析 ------------------------------- */

/** 简易 CSV 解析器：支持字段引号、引号转义、字段内换行。ECDICT 格式稳定，无需通用实现。 */
function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = '';
    let inQuote = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (inQuote) {
            if (c === '"') {
                if (text[i + 1] === '"') {
                    field += '"';
                    i++;
                } else {
                    inQuote = false;
                }
            } else {
                field += c;
            }
        } else {
            if (c === '"') inQuote = true;
            else if (c === ',') {
                row.push(field);
                field = '';
            } else if (c === '\n') {
                row.push(field);
                rows.push(row);
                row = [];
                field = '';
            } else if (c === '\r') {
                /** 忽略 */
            } else {
                field += c;
            }
        }
    }
    if (field.length > 0 || row.length > 0) {
        row.push(field);
        rows.push(row);
    }
    return rows;
}

/* ------------------------------ 行级转换 ------------------------------ */

const WORD_SHAPE_OK = /^[a-z][a-z\-' ]{0,40}$/;

function parseIntOrNull(s) {
    if (!s) return null;
    const n = parseInt(String(s).trim(), 10);
    return Number.isFinite(n) && n > 0 ? n : null;
}

function normalizePos(raw) {
    if (!raw) return '';
    /** ECDICT 词性格式："n:10/v:5/a:1"，我们只保留词性缩写 */
    const parts = String(raw)
        .split('/')
        .map((p) => p.split(':')[0].trim())
        .filter(Boolean);
    return [...new Set(parts)].join(',');
}

/**
 * 用 ECDICT 标签 + COCA 频率推导近似 CEFR。
 * 不如真实 CEFR-J 精确，但零依赖、许可干净。
 */
function deriveCefr(tags, oxford, coca) {
    if (tags.has('gre')) return 'C2';
    if (tags.has('toefl') || tags.has('ielts') || tags.has('ky')) return 'C1';
    if (tags.has('cet6')) return 'B2';
    if (tags.has('cet4')) return 'B1';
    if (tags.has('gk')) return 'B1';
    if (tags.has('zk')) return 'A2';
    if (oxford && coca !== null) {
        if (coca <= 1500) return 'A1';
        if (coca <= 3000) return 'A2';
        if (coca <= 5000) return 'B1';
    }
    if (coca !== null) {
        if (coca <= 8000) return 'B2';
        if (coca <= 15000) return 'C1';
    }
    return null;
}

/** 综合难度 1..5 */
function deriveDifficulty(tags, oxford, collins, coca) {
    if (tags.has('zk')) return 1;
    if (oxford && coca && coca <= 3000) return 1;
    if (tags.has('gk') || tags.has('cet4')) return 2;
    if (oxford && coca && coca <= 6000) return 2;
    if (tags.has('cet6')) return 3;
    if (collins >= 3 && coca && coca <= 10000) return 3;
    if (tags.has('ky') || tags.has('toefl') || tags.has('ielts')) return 4;
    if (coca && coca <= 15000 && collins >= 2) return 4;
    return 5;
}

function transformRow(rec) {
    const word = (rec.word || '').toLowerCase().trim();
    if (!word || !WORD_SHAPE_OK.test(word)) return null;

    const tagArr = (rec.tag || '').split(/\s+/).filter(Boolean);
    const tags = new Set(tagArr);
    const collins = parseInt(rec.collins, 10) || 0;
    const oxford = (rec.oxford || '').trim() === '1';
    const coca = parseIntOrNull(rec.frq);
    const bnc = parseIntOrNull(rec.bnc);

    const keep =
        collins >= 1 ||
        oxford ||
        tags.size > 0 ||
        (coca !== null && coca <= 15000);
    if (!keep) return null;

    return {
        word,
        phonetic: (rec.phonetic || '').trim() || null,
        definition_en: (rec.definition || '').trim().slice(0, 2000) || null,
        translation_zh: (rec.translation || '').trim().slice(0, 2000) || null,
        pos: normalizePos(rec.pos),
        collins_star: collins > 0 ? collins : null,
        oxford_3000: oxford,
        tag: tagArr.join(',') || null,
        bnc_rank: bnc,
        coca_rank: coca,
        cefr: deriveCefr(tags, oxford, coca),
        difficulty_level: deriveDifficulty(tags, oxford, collins, coca),
    };
}

/**
 * 从 ECDICT 的 exchange 字段解析屈折→原形映射。
 * 同一条目既可能是原形（内含 p:/d:/i:/3:/s:/r:/t:），
 * 也可能是屈折形式（含 0:lemma）。
 */
function parseExchange(rec) {
    const word = (rec.word || '').toLowerCase().trim();
    const ex = (rec.exchange || '').trim();
    if (!word || !ex) return { lemmaOfSelf: null, inflections: [] };

    let lemmaOfSelf = null;
    const inflections = [];
    for (const seg of ex.split('/')) {
        const idx = seg.indexOf(':');
        if (idx < 0) continue;
        const code = seg.slice(0, idx).trim();
        const form = seg.slice(idx + 1).toLowerCase().trim();
        if (!code || !form) continue;
        if (code === '0') {
            /** word 本身是屈折，其 lemma = form */
            if (form !== word && WORD_SHAPE_OK.test(form)) lemmaOfSelf = form;
        } else if (['p', 'd', 'i', '3', 's', 'r', 't'].includes(code)) {
            if (form !== word && WORD_SHAPE_OK.test(form)) inflections.push(form);
        }
    }
    return { lemmaOfSelf, inflections };
}

/* ------------------------------- 主流程 ------------------------------- */

async function runSchema() {
    console.log('→ 建表 + 索引');
    if (RESET) {
        console.log('  --reset：清空旧数据');
        await sql`DROP TABLE IF EXISTS dict_exchange`;
        await sql`DROP TABLE IF EXISTS dict_words`;
    }
    await sql`
        CREATE TABLE IF NOT EXISTS dict_words (
            word              TEXT PRIMARY KEY,
            phonetic          TEXT,
            definition_en     TEXT,
            translation_zh    TEXT,
            pos               TEXT,
            collins_star      SMALLINT,
            oxford_3000       BOOLEAN DEFAULT FALSE,
            tag               TEXT,
            bnc_rank          INT,
            coca_rank         INT,
            cefr              TEXT,
            difficulty_level  SMALLINT NOT NULL
        )
    `;
    await sql`
        CREATE TABLE IF NOT EXISTS dict_exchange (
            inflected  TEXT PRIMARY KEY,
            lemma      TEXT NOT NULL
        )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_dict_difficulty ON dict_words(difficulty_level)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_dict_cefr       ON dict_words(cefr)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_dict_coca       ON dict_words(coca_rank)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_exchange_lemma  ON dict_exchange(lemma)`;
    console.log('✓ 建表完成');
}

function chunk(arr, size) {
    const out = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
}

async function insertDictWords(rows) {
    /**
     * 批量插入：每批 500 条，COLUMNS 固定；冲突时覆盖。
     * Neon HTTP 驱动的 tagged-template 形式不支持动态拼 VALUES，
     * 必须走 sql.query(text, params) 的底层接口。
     */
    const BATCH = 500;
    let done = 0;
    for (const batch of chunk(rows, BATCH)) {
        const values = [];
        const params = [];
        let p = 0;
        for (const r of batch) {
            values.push(
                `($${++p},$${++p},$${++p},$${++p},$${++p},$${++p},$${++p},$${++p},$${++p},$${++p},$${++p},$${++p})`
            );
            params.push(
                r.word,
                r.phonetic,
                r.definition_en,
                r.translation_zh,
                r.pos,
                r.collins_star,
                r.oxford_3000,
                r.tag,
                r.bnc_rank,
                r.coca_rank,
                r.cefr,
                r.difficulty_level
            );
        }
        const text = `
            INSERT INTO dict_words
                (word, phonetic, definition_en, translation_zh, pos,
                 collins_star, oxford_3000, tag, bnc_rank, coca_rank, cefr, difficulty_level)
            VALUES ${values.join(',')}
            ON CONFLICT (word) DO UPDATE SET
                phonetic         = EXCLUDED.phonetic,
                definition_en    = EXCLUDED.definition_en,
                translation_zh   = EXCLUDED.translation_zh,
                pos              = EXCLUDED.pos,
                collins_star     = EXCLUDED.collins_star,
                oxford_3000      = EXCLUDED.oxford_3000,
                tag              = EXCLUDED.tag,
                bnc_rank         = EXCLUDED.bnc_rank,
                coca_rank        = EXCLUDED.coca_rank,
                cefr             = EXCLUDED.cefr,
                difficulty_level = EXCLUDED.difficulty_level
        `;
        await sql.query(text, params);
        done += batch.length;
        if (done % 5000 < BATCH) {
            process.stdout.write(`\r  词条已写入 ${done}/${rows.length}`);
        }
    }
    process.stdout.write(`\r  词条已写入 ${done}/${rows.length}\n`);
}

async function insertExchanges(pairs) {
    const BATCH = 800;
    let done = 0;
    for (const batch of chunk(pairs, BATCH)) {
        const values = [];
        const params = [];
        let p = 0;
        for (const r of batch) {
            values.push(`($${++p},$${++p})`);
            params.push(r.inflected, r.lemma);
        }
        const text = `
            INSERT INTO dict_exchange (inflected, lemma)
            VALUES ${values.join(',')}
            ON CONFLICT (inflected) DO UPDATE SET lemma = EXCLUDED.lemma
        `;
        await sql.query(text, params);
        done += batch.length;
        if (done % 8000 < BATCH) {
            process.stdout.write(`\r  屈折映射已写入 ${done}/${pairs.length}`);
        }
    }
    process.stdout.write(`\r  屈折映射已写入 ${done}/${pairs.length}\n`);
}

async function main() {
    await ensureCsv();

    console.log('→ 解析 CSV');
    const t1 = Date.now();
    const text = readFileSync(CACHE_CSV, 'utf8');
    const rows = parseCsv(text);
    const header = rows.shift();
    const idx = Object.fromEntries(header.map((h, i) => [h.trim(), i]));
    console.log(`  原始记录：${rows.length} 条，耗时 ${((Date.now() - t1) / 1000).toFixed(1)}s`);

    /** 过滤 + 转换 */
    const kept = [];
    const exchangeRaw = [];
    for (const r of rows) {
        if (r.length < 5) continue;
        const rec = {
            word: r[idx.word],
            phonetic: r[idx.phonetic],
            definition: r[idx.definition],
            translation: r[idx.translation],
            pos: r[idx.pos],
            collins: r[idx.collins],
            oxford: r[idx.oxford],
            tag: r[idx.tag],
            bnc: r[idx.bnc],
            frq: r[idx.frq],
            exchange: r[idx.exchange],
        };
        const row = transformRow(rec);
        if (row) kept.push(row);

        const ex = parseExchange(rec);
        if (ex.lemmaOfSelf) {
            exchangeRaw.push({ inflected: rec.word.toLowerCase().trim(), lemma: ex.lemmaOfSelf });
        }
        if (row && ex.inflections.length > 0) {
            for (const f of ex.inflections) {
                exchangeRaw.push({ inflected: f, lemma: row.word });
            }
        }
    }

    /** 去重：inflected 主键必须唯一 */
    const exMap = new Map();
    for (const r of exchangeRaw) {
        if (r.inflected === r.lemma) continue;
        if (!exMap.has(r.inflected)) exMap.set(r.inflected, r.lemma);
    }
    const exchanges = [...exMap.entries()].map(([inflected, lemma]) => ({ inflected, lemma }));

    console.log(`✓ 过滤后保留词条 ${kept.length} 个，屈折映射 ${exchanges.length} 条`);

    await runSchema();

    console.log(`→ 写入 dict_words（${kept.length} 条）`);
    const t2 = Date.now();
    await insertDictWords(kept);
    console.log(`  用时 ${((Date.now() - t2) / 1000).toFixed(1)}s`);

    console.log(`→ 写入 dict_exchange（${exchanges.length} 条）`);
    const t3 = Date.now();
    await insertExchanges(exchanges);
    console.log(`  用时 ${((Date.now() - t3) / 1000).toFixed(1)}s`);

    /** 简单校验 */
    const [{ c: wCount }] = await sql`SELECT COUNT(*)::int AS c FROM dict_words`;
    const [{ c: eCount }] = await sql`SELECT COUNT(*)::int AS c FROM dict_exchange`;
    console.log(`✓ 导入完成：dict_words=${wCount}，dict_exchange=${eCount}`);

    const sampleRows = await sql`
        SELECT difficulty_level AS lvl, COUNT(*)::int AS c
        FROM dict_words
        GROUP BY difficulty_level
        ORDER BY difficulty_level
    `;
    console.log('  按难度分布：');
    for (const s of sampleRows) {
        console.log(`    ${s.lvl}: ${s.c}`);
    }
}

main().catch((err) => {
    console.error('✗ 导入失败：', err);
    process.exit(1);
});
