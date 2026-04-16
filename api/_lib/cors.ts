import type { VercelResponse } from '@vercel/node';

/**
 * CORS 白名单策略：
 *   - 生产：严格匹配 https://lingo-vibe-five.vercel.app（可通过 env 覆盖）
 *   - 本地/局域网：放行 localhost / 127.0.0.1 / 192.168.*.* / 10.*.*.* / 172.16-31.*.*
 *   - 其他：一律拒绝
 *
 * 允许通过环境变量 LINGOVIBE_ALLOWED_ORIGINS 追加额外域名（逗号分隔），
 * 便于以后加自定义域名或预览部署而不用改代码。
 */

const PRODUCTION_ORIGIN = 'https://lingo-vibe-five.vercel.app';

function extraAllowed(): string[] {
    const raw = process.env.LINGOVIBE_ALLOWED_ORIGINS?.trim();
    if (!raw) return [];
    return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

/** 判断 origin 是否在私有/本地网段，用于本地开发放行 */
function isLocalOrPrivateOrigin(origin: string): boolean {
    try {
        const u = new URL(origin);
        const host = u.hostname;
        if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return true;
        // 192.168.x.x
        if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
        // 10.x.x.x
        if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
        // 172.16.x.x - 172.31.x.x
        const m = /^172\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(host);
        if (m) {
            const oct = Number(m[1]);
            if (oct >= 16 && oct <= 31) return true;
        }
        return false;
    } catch {
        return false;
    }
}

export function isOriginAllowed(origin: string | undefined): boolean {
    if (!origin) return false;
    if (origin === PRODUCTION_ORIGIN) return true;
    if (extraAllowed().includes(origin)) return true;
    if (isLocalOrPrivateOrigin(origin)) return true;
    return false;
}

/** 统一写入 CORS 响应头。若 origin 允许则精确回显，否则不写 ACAO（浏览器会拒绝） */
export function applyCors(res: VercelResponse, origin: string | undefined): void {
    if (origin && isOriginAllowed(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type, x-lv-timestamp, x-lv-signature'
    );
    res.setHeader('Access-Control-Max-Age', '86400');
}
