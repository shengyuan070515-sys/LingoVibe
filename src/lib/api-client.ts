/**
 * 统一的后端代理调用入口。
 *
 * 所有调用 `/api/ai-proxy` 的前端代码都应通过这里，以自动附带签名请求头。
 * 签名规则必须与 api/_lib/signing.ts 对齐：
 *   HMAC-SHA256(secret, `${timestamp}.${bodyString}`)
 *
 * 注意：这里的 secret 会打包进前端 JS，理论上可被逆向。主要作用是挡掉脚本直接 curl，
 * 不是加密级别的防御。配合 IP 限流已能覆盖大部分滥用场景。
 */

function getApiBase(): string {
    return ((import.meta.env.VITE_READING_API_BASE as string | undefined) ?? '')
        .trim()
        .replace(/\/$/, '');
}

function getSigningSecret(): string {
    return ((import.meta.env.VITE_LINGOVIBE_SIGNING_SECRET as string | undefined) ?? '').trim();
}

/** 用 Web Crypto 算 HMAC-SHA256，返回 hex 字符串 */
async function hmacSha256Hex(secret: string, message: string): Promise<string> {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
        'raw',
        enc.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
    const bytes = new Uint8Array(sig);
    let hex = '';
    for (let i = 0; i < bytes.length; i++) {
        hex += bytes[i]!.toString(16).padStart(2, '0');
    }
    return hex;
}

export interface AiProxyError extends Error {
    status: number;
    retryAfterSec?: number;
}

function buildAiProxyError(status: number, message: string, retryAfterSec?: number): AiProxyError {
    const err = new Error(message) as AiProxyError;
    err.status = status;
    if (retryAfterSec != null) err.retryAfterSec = retryAfterSec;
    return err;
}

/**
 * 调用 /api/ai-proxy 的统一入口。
 * @param payload 会被 JSON.stringify 一次；既用作 body 也用作签名 message 的一部分
 * @returns DeepSeek 原始响应（含 choices 等字段）
 */
export async function callAiProxy(payload: Record<string, unknown>): Promise<unknown> {
    const base = getApiBase();
    const url = base ? `${base}/api/ai-proxy` : '/api/ai-proxy';
    const secret = getSigningSecret();

    // 前后端必须对同一个字符串做 HMAC。
    // 这里一次性 stringify，然后用这个字符串作为 body 发送 + 签名 message。
    const bodyString = JSON.stringify(payload);
    const timestamp = Date.now().toString();

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    // 没配 secret 时不发签名头，后端会返回 503 提示
    if (secret) {
        const signature = await hmacSha256Hex(secret, `${timestamp}.${bodyString}`);
        headers['x-lv-timestamp'] = timestamp;
        headers['x-lv-signature'] = signature;
    }

    const res = await fetch(url, {
        method: 'POST',
        headers,
        body: bodyString,
    });

    if (!res.ok) {
        let errMsg = `请求失败 ${res.status}`;
        let retryAfterSec: number | undefined;
        try {
            const errBody = await res.json();
            errMsg = (errBody as any)?.error || (errBody as any)?.detail || errMsg;
        } catch {
            /* ignore */
        }
        // 429 时读取 Retry-After，给上游一个可用的等待时长
        if (res.status === 429) {
            const ra = res.headers.get('Retry-After');
            if (ra) {
                const n = Number(ra);
                if (Number.isFinite(n)) retryAfterSec = n;
            }
        }
        throw buildAiProxyError(res.status, errMsg, retryAfterSec);
    }

    return res.json();
}
