/**
 * Neon Postgres 连接助手。
 *
 * 兼容 Vercel ↔ Neon Integration 注入的两套变量名：
 *   - DATABASE_URL            （新版）
 *   - POSTGRES_URL            （旧版兼容）
 *   - DATABASE_URL_UNPOOLED   （直连，用于批量写入）
 *   - POSTGRES_URL_NON_POOLING（旧版兼容）
 *
 * 优先使用 pooled 连接；若传 `unpooled: true` 则用直连（仅限一次性脚本/迁移）。
 */

import { neon, type NeonQueryFunction } from '@neondatabase/serverless';

export class DictDbNotReadyError extends Error {
    constructor() {
        super('Dictionary database is not configured (DATABASE_URL/POSTGRES_URL missing)');
        this.name = 'DictDbNotReadyError';
    }
}

/**
 * Neon Integration 可能给变量加自定义前缀（如 POSTGRES_DATABASE_URL），
 * 也可能保留标准命名（DATABASE_URL）。这里列出所有已知变体，兜底所有情况。
 */
const POOLED_CANDIDATES = [
    'DATABASE_URL',
    'POSTGRES_URL',
    'POSTGRES_DATABASE_URL',
    'POSTGRES_PRISMA_URL',
] as const;

const UNPOOLED_CANDIDATES = [
    'DATABASE_URL_UNPOOLED',
    'POSTGRES_URL_NON_POOLING',
    'POSTGRES_DATABASE_URL_UNPOOLED',
    'POSTGRES_URL_NO_SSL',
] as const;

function readConnectionString(unpooled: boolean): string | null {
    const primary = unpooled ? UNPOOLED_CANDIDATES : POOLED_CANDIDATES;
    const fallback = unpooled ? POOLED_CANDIDATES : UNPOOLED_CANDIDATES;
    for (const k of [...primary, ...fallback]) {
        const v = process.env[k];
        if (v && v.trim()) return v.trim();
    }
    return null;
}

export function hasDictDb(): boolean {
    return readConnectionString(false) !== null;
}

let pooledSql: NeonQueryFunction<false, false> | null = null;
let unpooledSql: NeonQueryFunction<false, false> | null = null;

/**
 * 获取 SQL tagged-template 函数。
 *
 * 用法：
 *   const sql = getSql();
 *   const rows = await sql`SELECT * FROM dict_words WHERE word = ${w}`;
 *
 * 若没有配置数据库，抛 DictDbNotReadyError（调用方决定回退还是报错）。
 */
export function getSql(options?: { unpooled?: boolean }): NeonQueryFunction<false, false> {
    const unpooled = options?.unpooled === true;
    const cached = unpooled ? unpooledSql : pooledSql;
    if (cached) return cached;

    const conn = readConnectionString(unpooled);
    if (!conn) throw new DictDbNotReadyError();

    const fn = neon(conn);
    if (unpooled) unpooledSql = fn;
    else pooledSql = fn;
    return fn;
}
