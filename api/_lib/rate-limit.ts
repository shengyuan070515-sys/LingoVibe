import { kv } from '@vercel/kv';
import type { VercelRequest } from '@vercel/node';

/**
 * IP 限流：默认档 20/min + 200/day。
 *
 * 采用"固定窗口"策略：
 *   - 每分钟的窗口 key: rl:min:{ip}:{YYYYMMDDHHmm}
 *   - 每日的窗口 key:   rl:day:{ip}:{YYYYMMDD}
 *
 * 每个 key 自带 TTL（分钟窗口 2 分钟，日窗口 25 小时），过期即自动清理。
 * 不需要 sliding window 那么精确——这里目标是挡脚本刷量，不是精准计费。
 */

const LIMIT_PER_MINUTE = 20;
const LIMIT_PER_DAY = 200;

export type RateLimitResult =
    | { ok: true; minuteCount: number; dayCount: number }
    | { ok: false; scope: 'minute' | 'day'; limit: number; retryAfterSec: number };

export function getClientIp(req: VercelRequest): string {
    const xff = req.headers['x-forwarded-for'];
    if (typeof xff === 'string' && xff.length > 0) {
        // x-forwarded-for 可能是逗号分隔的链路，取第一个
        return xff.split(',')[0]!.trim();
    }
    if (Array.isArray(xff) && xff[0]) return xff[0].trim();
    const real = req.headers['x-real-ip'];
    if (typeof real === 'string' && real.length > 0) return real.trim();
    return 'unknown';
}

function minuteWindowKey(ip: string, now: Date): string {
    const y = now.getUTCFullYear();
    const m = String(now.getUTCMonth() + 1).padStart(2, '0');
    const d = String(now.getUTCDate()).padStart(2, '0');
    const h = String(now.getUTCHours()).padStart(2, '0');
    const mi = String(now.getUTCMinutes()).padStart(2, '0');
    return `rl:min:${ip}:${y}${m}${d}${h}${mi}`;
}

function dayWindowKey(ip: string, now: Date): string {
    const y = now.getUTCFullYear();
    const m = String(now.getUTCMonth() + 1).padStart(2, '0');
    const d = String(now.getUTCDate()).padStart(2, '0');
    return `rl:day:${ip}:${y}${m}${d}`;
}

function skipKv(): boolean {
    return process.env.LINGOVIBE_RATE_LIMIT_SKIP === '1' || process.env.LINGOVIBE_RATE_LIMIT_SKIP === 'true';
}

/**
 * 调用一次 = 消费一次配额。
 * 如果 KV 未配置或环境变量 LINGOVIBE_RATE_LIMIT_SKIP=1，直接放行（便于本地调试）。
 */
export async function consumeRateLimit(ip: string): Promise<RateLimitResult> {
    if (skipKv()) return { ok: true, minuteCount: 0, dayCount: 0 };

    const now = new Date();
    const minKey = minuteWindowKey(ip, now);
    const dayKey = dayWindowKey(ip, now);

    try {
        // KV 的 incr 如果 key 不存在会从 0 开始自增到 1
        const [minCount, dayCount] = await Promise.all([kv.incr(minKey), kv.incr(dayKey)]);

        // 首次自增时顺带设置 TTL（不阻塞响应）
        if (minCount === 1) void kv.expire(minKey, 120); // 2 分钟
        if (dayCount === 1) void kv.expire(dayKey, 60 * 60 * 25); // 25 小时

        if (minCount > LIMIT_PER_MINUTE) {
            const retrySec = 60 - now.getUTCSeconds();
            return {
                ok: false,
                scope: 'minute',
                limit: LIMIT_PER_MINUTE,
                retryAfterSec: Math.max(1, retrySec),
            };
        }
        if (dayCount > LIMIT_PER_DAY) {
            // 到下一个 UTC 自然日的秒数
            const next = new Date(Date.UTC(
                now.getUTCFullYear(),
                now.getUTCMonth(),
                now.getUTCDate() + 1,
                0, 0, 0,
            ));
            const retrySec = Math.max(1, Math.floor((next.getTime() - now.getTime()) / 1000));
            return {
                ok: false,
                scope: 'day',
                limit: LIMIT_PER_DAY,
                retryAfterSec: retrySec,
            };
        }

        return { ok: true, minuteCount: minCount, dayCount: dayCount };
    } catch (e) {
        // KV 异常不能把用户锁在外面，静默放行，服务端日志里留痕
        console.warn('[rate-limit] KV error, fallthrough:', e instanceof Error ? e.message : e);
        return { ok: true, minuteCount: 0, dayCount: 0 };
    }
}
