import { describe, it, expect } from 'vitest';
import {
    capChatState,
    createEmptySession,
    MAX_MESSAGES_PER_SESSION,
    MAX_SESSIONS_PER_MODE,
    type AiChatPersistedState,
    type Message,
    type Session,
} from './ai-chat';

function makeMsg(i: number): Message {
    return { role: i % 2 === 0 ? 'user' : 'assistant', content: `msg-${i}` };
}

function makeSession(id: string, opts?: { updatedAt?: number; messageCount?: number }): Session {
    const updatedAt = opts?.updatedAt ?? Date.now();
    const messageCount = opts?.messageCount ?? 0;
    return {
        id,
        title: id,
        messages: Array.from({ length: messageCount }, (_, i) => makeMsg(i)),
        updatedAt,
    };
}

function baseState(overrides: Partial<AiChatPersistedState['sessionsByMode']> = {}): AiChatPersistedState {
    const v = createEmptySession();
    const c = createEmptySession();
    const s = createEmptySession();
    return {
        version: 2,
        chatMode: 'vocabulary',
        sessionsByMode: {
            vocabulary: overrides.vocabulary ?? [v],
            casual: overrides.casual ?? [c],
            surprise: overrides.surprise ?? [s],
        },
        currentSessionIdByMode: {
            vocabulary: (overrides.vocabulary ?? [v])[0]?.id ?? null,
            casual: (overrides.casual ?? [c])[0]?.id ?? null,
            surprise: (overrides.surprise ?? [s])[0]?.id ?? null,
        },
    };
}

describe('capChatState · 给 ai_chat_v2 封顶', () => {
    it('单 session 内消息超过上限时保留最近 N 条', () => {
        const huge = makeSession('big', { messageCount: MAX_MESSAGES_PER_SESSION + 50 });
        const state = baseState({ vocabulary: [huge] });
        state.currentSessionIdByMode.vocabulary = 'big';

        const capped = capChatState(state);
        const big = capped.sessionsByMode.vocabulary.find((s) => s.id === 'big')!;
        expect(big.messages.length).toBe(MAX_MESSAGES_PER_SESSION);
        // 最新 N 条保留，老的丢弃；最后一条 content 应为 msg-(total-1)
        const totalBefore = MAX_MESSAGES_PER_SESSION + 50;
        expect(big.messages[big.messages.length - 1]!.content).toBe(`msg-${totalBefore - 1}`);
    });

    it('某模式 session 数超过上限时按 updatedAt 倒序保留新的', () => {
        const sessions = Array.from({ length: MAX_SESSIONS_PER_MODE + 10 }, (_, i) =>
            makeSession(`s-${i}`, { updatedAt: i * 1000 })
        );
        const state = baseState({ vocabulary: sessions });
        state.currentSessionIdByMode.vocabulary = `s-${MAX_SESSIONS_PER_MODE + 9}`;

        const capped = capChatState(state);
        expect(capped.sessionsByMode.vocabulary).toHaveLength(MAX_SESSIONS_PER_MODE);
        // 最新的 s-39（i=39, updatedAt=39000）必须保留
        expect(capped.sessionsByMode.vocabulary.some((s) => s.id === `s-${MAX_SESSIONS_PER_MODE + 9}`)).toBe(true);
        // 最老的 s-0 应该被丢弃
        expect(capped.sessionsByMode.vocabulary.some((s) => s.id === 's-0')).toBe(false);
    });

    it('当前活跃 session 即使不在 top N 里也必须保留', () => {
        // 30 个新 session + 1 个老 session 作为"当前"
        const oldCurrent = makeSession('old-current', { updatedAt: 1 });
        const fresh = Array.from({ length: MAX_SESSIONS_PER_MODE }, (_, i) =>
            makeSession(`s-${i}`, { updatedAt: 1000 + i })
        );
        const state = baseState({ vocabulary: [oldCurrent, ...fresh] });
        state.currentSessionIdByMode.vocabulary = 'old-current';

        const capped = capChatState(state);
        expect(capped.sessionsByMode.vocabulary).toHaveLength(MAX_SESSIONS_PER_MODE);
        expect(capped.sessionsByMode.vocabulary.some((s) => s.id === 'old-current')).toBe(true);
    });

    it('未超上限时返回原对象引用（无副作用）', () => {
        const state = baseState();
        const capped = capChatState(state);
        expect(capped).toBe(state);
    });
});
