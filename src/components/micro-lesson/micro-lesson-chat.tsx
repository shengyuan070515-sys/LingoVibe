import * as React from 'react';
import { Loader2, Mic, Send, Languages } from 'lucide-react';
import { useEnglishSpeechRecognition } from '@/hooks/use-english-speech-recognition';
import {
    type Message,
    emmaCoffeeShopBaristaPrompt,
    fetchEmmaChatCompletion,
    fetchEnglishToChineseTranslation,
} from '@/lib/ai-chat';
import {
    evaluateLexiconCoverage,
    isLexiconMissionComplete,
    type LexiconProgressPayload,
} from '@/lib/micro-lesson-mission';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { recordChatMessage } from '@/store/learningAnalyticsStore';
import { useDailyLoopStore, syncDailyLoopDate } from '@/store/dailyLoopStore';

export type { LexiconProgressPayload };

/** 仅用于微课气泡展示：去掉误塞进正文的译文 / 末尾中文，不修改全局 ai-chat */
function assistantBubbleEnglish(msg: Message): string {
    if (msg.role !== 'assistant') return msg.content;
    let c = msg.content.trim();
    const t = msg.translation?.trim();
    if (t) {
        while (c.includes(t)) {
            const i = c.indexOf(t);
            c = (c.slice(0, i) + c.slice(i + t.length)).trim();
        }
    }
    const corr = msg.correction?.trim();
    if (corr) {
        while (c.includes(corr)) {
            const i = c.indexOf(corr);
            c = (c.slice(0, i) + c.slice(i + corr.length)).trim();
        }
    }
    c = c
        .replace(
            /(?:\s+[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef][\u4e00-\u9fff\u3000-\u303f\uff00-\uffef\s，。！？、；："" ''（）《》\-\n·]*)\s*$/u,
            ''
        )
        .trim();
    const out = c.replace(/\s{2,}/g, ' ').trim();
    return out.length > 0 ? out : msg.content.trim();
}

type MicroLessonChatProps = {
    messages: Message[];
    onMessagesChange: React.Dispatch<React.SetStateAction<Message[]>>;
    onLexiconProgress?: (payload: LexiconProgressPayload) => void;
};

export function MicroLessonChat({ messages, onMessagesChange, onLexiconProgress }: MicroLessonChatProps) {
    const { toast } = useToast();
    const markChatRoundDone = useDailyLoopStore((s) => s.markChatRoundDone);

    const [input, setInput] = React.useState('');
    const [isLoading, setIsLoading] = React.useState(false);
    const listRef = React.useRef<HTMLDivElement>(null);
    const messagesRef = React.useRef(messages);
    messagesRef.current = messages;

    React.useEffect(() => {
        const userTexts = messages.filter((m) => m.role === 'user').map((m) => m.content);
        const coverage = evaluateLexiconCoverage(userTexts);
        const complete = isLexiconMissionComplete(coverage);
        onLexiconProgress?.({ coverage, complete });
    }, [messages, onLexiconProgress]);

    React.useEffect(() => {
        syncDailyLoopDate();
    }, []);

    const scrollDown = React.useCallback(() => {
        listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
    }, []);

    React.useEffect(() => {
        scrollDown();
    }, [messages, isLoading, scrollDown]);

    const appendFromVoice = React.useCallback((text: string) => {
        setInput((prev) => {
            const p = prev.trim();
            if (!p) return text;
            return `${p} ${text}`;
        });
    }, []);

    const { listening, toggle: toggleMic, supported: speechSupported } = useEnglishSpeechRecognition(
        appendFromVoice,
        (m) => toast(m, 'error')
    );

    const handleSend = async () => {
        const text = input.trim();
        if (!text || isLoading) return;

        const userMessage: Message = { role: 'user', content: text };
        const next = [...messages, userMessage];
        onMessagesChange(next);
        setInput('');
        setIsLoading(true);
        recordChatMessage();

        try {
            const payload = next.map((m) => ({ role: m.role, content: m.content }));
            const { correction, content, translation } = await fetchEmmaChatCompletion(
                emmaCoffeeShopBaristaPrompt,
                payload
            );
            const assistantMessage: Message = {
                role: 'assistant',
                content: assistantBubbleEnglish({
                    role: 'assistant',
                    content,
                    correction,
                    translation,
                }),
                correction,
                translation,
                showTranslation: false,
            };
            onMessagesChange((prev) => [...prev, assistantMessage]);
            markChatRoundDone();
        } catch (e) {
            console.error(e);
            const msg = e instanceof Error ? e.message : '连接失败，请稍后重试';
            toast(msg, 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const toggleTranslation = async (index: number) => {
        const target = messagesRef.current[index];
        if (!target || target.role !== 'assistant') return;

        if (target.showTranslation) {
            onMessagesChange((prev) => prev.map((m, i) => (i === index ? { ...m, showTranslation: false } : m)));
            return;
        }

        if (target.translation) {
            onMessagesChange((prev) => prev.map((m, i) => (i === index ? { ...m, showTranslation: true } : m)));
            return;
        }

        if (target.isTranslating) return;

        const fpContent = target.content;
        const englishForApi = assistantBubbleEnglish(target);
        onMessagesChange((prev) =>
            prev.map((m, i) => (i === index ? { ...m, isTranslating: true, showTranslation: true } : m))
        );

        try {
            const translation = await fetchEnglishToChineseTranslation(englishForApi);
            onMessagesChange((prev) =>
                prev.map((m, i) =>
                    i === index && m.role === 'assistant' && m.content === fpContent
                        ? {
                              ...m,
                              translation: translation || '（暂无译文）',
                              isTranslating: false,
                          }
                        : m
                )
            );
        } catch (e) {
            console.error(e);
            toast(e instanceof Error ? e.message : '翻译失败', 'error');
            onMessagesChange((prev) =>
                prev.map((m, i) =>
                    i === index && m.role === 'assistant' && m.content === fpContent
                        ? { ...m, isTranslating: false, showTranslation: false }
                        : m
                )
            );
        }
    };

    return (
        <div className="overflow-hidden rounded-[1.35rem] bg-white/60 shadow-[0_8px_40px_-16px_rgba(15,118,110,0.2)] ring-1 ring-white/80 backdrop-blur-xl">
            <div className="flex items-center gap-3 border-b border-white/60 bg-white/45 px-4 py-3 backdrop-blur-md">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-400/90 to-cyan-500/80 text-white shadow-sm">
                    <span className="text-sm font-bold">E</span>
                </div>
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-800">AI 店员 · Emma</p>
                    <p className="text-xs text-slate-500">
                        文本或英文语音输入 · 真实 AI 对话
                        {!speechSupported ? ' · 当前环境无语音识别' : null}
                    </p>
                </div>
                <span className="rounded-full bg-emerald-100/90 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                    Live
                </span>
            </div>

            <div
                ref={listRef}
                className="max-h-[min(52vh,420px)] space-y-3 overflow-y-auto bg-gradient-to-b from-slate-50/40 to-white/30 px-4 py-4"
            >
                {messages.map((msg, index) => (
                    <div
                        key={`micro-lesson-msg-${index}`}
                        className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}
                    >
                        <div
                            className={cn(
                                'max-w-[min(100%,20rem)] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ring-1',
                                msg.role === 'user'
                                    ? 'bg-teal-600 text-white ring-teal-500/30'
                                    : 'bg-white/85 text-slate-700 ring-slate-100/90'
                            )}
                        >
                            {msg.role === 'assistant' && msg.correction ? (
                                <div className="mb-2 rounded-xl border border-red-200/80 bg-red-50/95 p-3 text-xs text-red-900">
                                    <p className="mb-1 font-bold">【纠错】</p>
                                    <p className="leading-relaxed">{msg.correction}</p>
                                </div>
                            ) : null}
                            <p>{msg.role === 'assistant' ? assistantBubbleEnglish(msg) : msg.content}</p>
                            {msg.role === 'assistant' ? (
                                <div className="mt-2 border-t border-slate-100/90 pt-2">
                                    <button
                                        type="button"
                                        disabled={msg.isTranslating}
                                        onClick={() => void toggleTranslation(index)}
                                        aria-label={
                                            msg.showTranslation
                                                ? '隐藏本条中文译文'
                                                : msg.isTranslating
                                                  ? '正在加载中文译文'
                                                  : '查看本条中文译文'
                                        }
                                        className="flex items-center gap-1 text-[11px] font-semibold text-teal-700 hover:underline disabled:opacity-60"
                                    >
                                        <Languages className="h-3.5 w-3.5" />
                                        {msg.isTranslating
                                            ? '翻译中…'
                                            : msg.showTranslation
                                              ? '隐藏中文'
                                              : '查看中文'}
                                    </button>
                                    {msg.showTranslation ? (
                                        <div className="mt-2">
                                            {msg.isTranslating ? (
                                                <div className="flex items-center gap-2 text-xs text-slate-500">
                                                    <Loader2 className="h-3.5 w-3.5 animate-spin text-teal-600" />
                                                    正在生成中文…
                                                </div>
                                            ) : (
                                                <p className="text-xs italic leading-relaxed text-slate-600">
                                                    {msg.translation || '（暂无译文）'}
                                                </p>
                                            )}
                                        </div>
                                    ) : null}
                                </div>
                            ) : null}
                        </div>
                    </div>
                ))}
                {isLoading ? (
                    <div className="flex justify-start">
                        <div className="flex items-center gap-2 rounded-2xl bg-white/85 px-4 py-3 text-sm text-slate-500 ring-1 ring-slate-100/90">
                            <Loader2 className="h-4 w-4 animate-spin text-teal-600" />
                            Emma is thinking…
                        </div>
                    </div>
                ) : null}
            </div>

            <div className="border-t border-white/60 bg-white/50 p-3 backdrop-blur-md">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                    <div className="relative min-h-[48px] flex-1">
                        <textarea
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    void handleSend();
                                }
                            }}
                            disabled={isLoading}
                            placeholder="用英文点单，或先点麦克风再说…"
                            rows={2}
                            aria-label="用英文输入点单内容，Enter 发送，Shift+Enter 换行"
                            className="w-full resize-none rounded-2xl border border-slate-200/90 bg-white/80 py-3 pl-3 pr-12 text-[15px] leading-relaxed text-slate-800 placeholder:text-slate-400 focus:border-teal-300 focus:outline-none focus:ring-2 focus:ring-teal-200/60 disabled:opacity-50"
                        />
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            disabled={isLoading || !speechSupported}
                            onClick={() => toggleMic()}
                            aria-label={
                                !speechSupported
                                    ? '当前浏览器不支持英文语音识别'
                                    : listening
                                      ? '停止英文语音听写'
                                      : '开始英文语音听写'
                            }
                            title={
                                speechSupported
                                    ? listening
                                        ? '点击停止听写'
                                        : '英文语音输入'
                                    : '浏览器不支持语音识别'
                            }
                            className={cn(
                                'absolute bottom-2 right-2 h-9 w-9 rounded-xl',
                                listening
                                    ? 'bg-red-50 text-red-600 hover:bg-red-100'
                                    : 'text-slate-400 hover:bg-slate-100 hover:text-teal-700'
                            )}
                        >
                            <Mic className={cn('h-4 w-4', listening && 'animate-pulse')} />
                        </Button>
                    </div>
                    <Button
                        type="button"
                        onClick={() => void handleSend()}
                        disabled={isLoading || !input.trim()}
                        aria-label="发送英文消息"
                        className="h-11 shrink-0 rounded-2xl bg-teal-600 px-6 text-white shadow-md shadow-teal-700/15 hover:bg-teal-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
                    >
                        <Send className="mr-2 h-4 w-4" />
                        发送
                    </Button>
                </div>
                {listening ? (
                    <p className="mt-2 text-center text-xs font-medium text-red-600">正在聆听…说完后稍停，或再点麦克风结束</p>
                ) : null}
            </div>
        </div>
    );
}
