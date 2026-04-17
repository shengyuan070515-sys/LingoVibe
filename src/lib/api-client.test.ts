import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { callAiProxy, type AiProxyError } from './api-client';

describe('callAiProxy', () => {
    beforeEach(() => {
        vi.stubGlobal('fetch', vi.fn());
        // Make tests deterministic: do not inherit machine/CI env defaults.
        vi.stubEnv('VITE_READING_API_BASE', '');
        vi.stubEnv('VITE_LINGOVIBE_SIGNING_SECRET', '');
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
    });

    function mockFetchOk(body: unknown = {}) {
        const fn = vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve(body),
        });
        vi.stubGlobal('fetch', fn);
        return fn;
    }

    it('sends POST to /api/ai-proxy with correct Content-Type', async () => {
        const mock = mockFetchOk({ choices: [] });

        await callAiProxy({ messages: [{ role: 'user', content: 'hello' }] });

        expect(mock).toHaveBeenCalledTimes(1);
        const [url, init] = mock.mock.calls[0]!;
        expect(url).toBe('/api/ai-proxy');
        expect(init.method).toBe('POST');
        expect(init.headers['Content-Type']).toBe('application/json');
    });

    it('prepends VITE_READING_API_BASE to the URL when set', async () => {
        vi.stubEnv('VITE_READING_API_BASE', 'https://api.example.com/');
        const mock = mockFetchOk();

        await callAiProxy({ prompt: 'hi' });

        const [url] = mock.mock.calls[0]!;
        expect(url).toBe('https://api.example.com/api/ai-proxy');
    });

    it('sends body as JSON-stringified payload', async () => {
        const mock = mockFetchOk();
        const payload = { messages: [{ role: 'user', content: 'test' }] };

        await callAiProxy(payload);

        const [, init] = mock.mock.calls[0]!;
        expect(init.body).toBe(JSON.stringify(payload));
    });

    it('throws AiProxyError on non-ok response', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                ok: false,
                status: 500,
                json: () => Promise.resolve({ error: 'internal' }),
                headers: new Headers(),
            }),
        );

        try {
            await callAiProxy({ prompt: 'hi' });
            expect.unreachable('should have thrown');
        } catch (err) {
            const e = err as AiProxyError;
            expect(e).toBeInstanceOf(Error);
            expect(e.status).toBe(500);
        }
    });

    it('parses Retry-After header on 429 into retryAfterSec', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                ok: false,
                status: 429,
                json: () => Promise.resolve({ error: 'rate limited' }),
                headers: new Headers({ 'Retry-After': '42' }),
            }),
        );

        try {
            await callAiProxy({ prompt: 'hi' });
            expect.unreachable('should have thrown');
        } catch (err) {
            const e = err as AiProxyError;
            expect(e.status).toBe(429);
            expect(e.retryAfterSec).toBe(42);
        }
    });

    it('omits signing headers when secret is not configured', async () => {
        const mock = mockFetchOk();

        await callAiProxy({ prompt: 'hi' });

        const [, init] = mock.mock.calls[0]!;
        expect(init.headers['x-lv-timestamp']).toBeUndefined();
        expect(init.headers['x-lv-signature']).toBeUndefined();
    });

    it('attaches HMAC signing headers when secret is configured', async () => {
        vi.stubEnv('VITE_LINGOVIBE_SIGNING_SECRET', 'test-secret');
        const mock = mockFetchOk();

        await callAiProxy({ prompt: 'hi' });

        const [, init] = mock.mock.calls[0]!;
        expect(init.headers['x-lv-timestamp']).toMatch(/^\d+$/);
        expect(init.headers['x-lv-signature']).toMatch(/^[0-9a-f]{64}$/);
    });
});
