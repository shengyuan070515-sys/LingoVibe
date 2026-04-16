import crypto from 'node:crypto';

/**
 * 请求签名校验规则：
 *
 * 前端每次请求带上：
 *   - Header: x-lv-timestamp —— 毫秒时间戳
 *   - Header: x-lv-signature —— HMAC-SHA256(secret, `${timestamp}.${bodyString}`) 的 hex
 *
 * 后端校验：
 *   1) 时间戳必须在当前时间 ±SIGNATURE_WINDOW_MS 之内（默认 5 分钟）
 *   2) 用同样的 secret 和规则计算签名，必须与前端提供的完全一致
 *
 * 不是不可破解的，但能挡住 99% 的脚本直接 curl 攻击。配合 IP 限流已经够用。
 */

const SIGNATURE_WINDOW_MS = 5 * 60 * 1000;

export type SignatureCheckResult =
    | { ok: true }
    | { ok: false; code: 'missing' | 'expired' | 'mismatch' | 'not_configured'; detail: string };

export function verifyRequestSignature(
    timestampHeader: string | string[] | undefined,
    signatureHeader: string | string[] | undefined,
    rawBody: string
): SignatureCheckResult {
    const secret = process.env.LINGOVIBE_SIGNING_SECRET?.trim();
    if (!secret) {
        return {
            ok: false,
            code: 'not_configured',
            detail: '服务端未配置 LINGOVIBE_SIGNING_SECRET',
        };
    }

    const ts = Array.isArray(timestampHeader) ? timestampHeader[0] : timestampHeader;
    const sig = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;

    if (!ts || !sig) {
        return { ok: false, code: 'missing', detail: '缺少签名请求头' };
    }

    const tsNum = Number(ts);
    if (!Number.isFinite(tsNum)) {
        return { ok: false, code: 'missing', detail: '时间戳格式错误' };
    }

    const now = Date.now();
    if (Math.abs(now - tsNum) > SIGNATURE_WINDOW_MS) {
        return { ok: false, code: 'expired', detail: '请求已过期，请重试' };
    }

    const expected = crypto
        .createHmac('sha256', secret)
        .update(`${ts}.${rawBody}`)
        .digest('hex');

    const sigBuf = safeHexBuffer(sig);
    const expBuf = safeHexBuffer(expected);
    if (!sigBuf || !expBuf || sigBuf.length !== expBuf.length) {
        return { ok: false, code: 'mismatch', detail: '签名不匹配' };
    }
    if (!crypto.timingSafeEqual(sigBuf, expBuf)) {
        return { ok: false, code: 'mismatch', detail: '签名不匹配' };
    }

    return { ok: true };
}

function safeHexBuffer(s: string): Buffer | null {
    if (!/^[0-9a-fA-F]+$/.test(s)) return null;
    try {
        return Buffer.from(s, 'hex');
    } catch {
        return null;
    }
}
