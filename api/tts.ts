import type { VercelRequest, VercelResponse } from '@vercel/node';
import { TextToSpeechClient } from '@google-cloud/text-to-speech';
import { applyCors, isOriginAllowed } from './_lib/cors.js';
import { consumeRateLimit, getClientIp } from './_lib/rate-limit.js';

const MAX_CHARS = 4500;

function getTtsClient(): TextToSpeechClient | null {
    const raw = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON?.trim();
    if (!raw) return null;
    try {
        const credentials = JSON.parse(raw) as Record<string, unknown>;
        return new TextToSpeechClient({ credentials });
    } catch {
        return null;
    }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    const origin = req.headers.origin as string | undefined;
    applyCors(res, origin);

    if (req.method === 'OPTIONS') {
        res.status(204).end();
        return;
    }

    if (origin && !isOriginAllowed(origin)) {
        res.status(403).json({ error: 'Origin not allowed' });
        return;
    }

    if (req.method !== 'POST') {
        res.status(405).setHeader('Allow', 'POST, OPTIONS').json({ error: 'Method not allowed' });
        return;
    }

    const rl = await consumeRateLimit(getClientIp(req));
    if (!rl.ok) {
        res.setHeader('Retry-After', String(rl.retryAfterSec));
        res.status(429).json({ error: `Rate limit exceeded (${rl.scope})`, retryAfterSec: rl.retryAfterSec });
        return;
    }

    let body: unknown = req.body;
    if (typeof body === 'string') {
        try {
            body = JSON.parse(body) as unknown;
        } catch {
            res.status(400).json({ error: 'Invalid JSON body' });
            return;
        }
    }

    const text =
        typeof (body as { text?: unknown }).text === 'string'
            ? (body as { text: string }).text.trim()
            : '';

    if (!text) {
        res.status(400).json({ error: 'Missing text' });
        return;
    }
    if (text.length > MAX_CHARS) {
        res.status(400).json({ error: `Text too long (max ${MAX_CHARS} chars)` });
        return;
    }

    const client = getTtsClient();
    if (!client) {
        res.status(503).json({
            error: 'TTS not configured',
            detail: 'Set GOOGLE_APPLICATION_CREDENTIALS_JSON in Vercel env (service account JSON string)',
        });
        return;
    }

    const languageCode = process.env.TTS_LANGUAGE_CODE?.trim() || 'en-US';
    const voiceName = process.env.TTS_VOICE_NAME?.trim() || 'en-US-Neural2-J';
    const rateRaw = process.env.TTS_SPEAKING_RATE?.trim();
    const speakingRate = rateRaw ? Number(rateRaw) : 1;
    const safeRate = Number.isFinite(speakingRate) ? Math.min(2, Math.max(0.25, speakingRate)) : 1;

    try {
        const [response] = await client.synthesizeSpeech({
            input: { text },
            voice: { languageCode, name: voiceName },
            audioConfig: {
                audioEncoding: 'MP3',
                speakingRate: safeRate,
            },
        });

        const audio = response.audioContent;
        if (!audio) {
            res.status(502).json({ error: 'Empty audio response' });
            return;
        }

        const buf = Buffer.isBuffer(audio) ? audio : Buffer.from(audio as Uint8Array);
        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Cache-Control', 'private, max-age=3600');
        res.status(200).send(buf);
    } catch (e) {
        const msg = e instanceof Error ? e.message : 'TTS failed';
        res.status(502).json({ error: 'synthesizeSpeech failed', detail: msg.slice(0, 500) });
    }
}
