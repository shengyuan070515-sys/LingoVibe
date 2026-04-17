import * as React from 'react';
import { motion } from 'framer-motion';
import {
    Send,
    Mic,
    Loader2,
    Languages,
    Plus,
    MessageSquare,
    Trash2,
    MoreVertical,
    Pencil,
    BookOpen,
    Coffee,
    Sparkles,
    Menu,
    Volume2,
    Square,
    Sparkle,
    Lightbulb,
    Bolt,
    Image as ImageIcon,
} from 'lucide-react';
import { WordCollectParticleBurst } from '@/components/ui/favorite-burst-button';
import { useLocalStorage } from "@/hooks/use-local-storage";
import { useWordBankStore } from "@/store/wordBankStore";
import {
    type ChatMode,
    type Session,
    type Message,
    emmaSystemPrompt,
    createEmptySession,
    migrateLegacyChatSessionsIfNeeded,
    fetchProactiveOpening,
    fetchEmmaChatCompletion,
    fetchEnglishToChineseTranslation,
    type AiChatPersistedState,
} from '@/lib/ai-chat';
import { cn } from '@/lib/utils';
import { callAiProxy } from '@/lib/api-client';
import { recordChatMessage, useLearningAnalyticsStore } from '@/store/learningAnalyticsStore';
import { useDailyLoopStore, syncDailyLoopDate } from '@/store/dailyLoopStore';
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useEnglishSpeechRecognition } from '@/hooks/use-english-speech-recognition';
import { speakEnglish, stopSpeakEnglish } from '@/lib/speak-english';

/** 可按模式切换；后续可改为独立「场景」配置或路由参数 */
export const CHAT_SCENARIO_BY_MODE: Record<
    ChatMode,
    { scenario: string; focusLine: string; focusSub: string; Icon: typeof BookOpen }
> = {
    vocabulary: {
        scenario: '学习工坊',
        focusLine: 'Speaking focus',
        focusSub: '生词运用 · Active vocabulary',
        Icon: BookOpen,
    },
    casual: {
        scenario: '咖啡馆',
        focusLine: 'Speaking focus',
        focusSub: '礼貌点餐 · Polite ordering',
        Icon: Coffee,
    },
    surprise: {
        scenario: '自由谈天',
        focusLine: 'Speaking focus',
        focusSub: '自然应答 · Spontaneous replies',
        Icon: Sparkles,
    },
};

function userInitialsFromName(name: string): string {
    const s = name.trim();
    if (!s) return 'ME';
    const p = s.split(/\s+/).filter(Boolean);
    if (p.length >= 2) return (p[0]![0]! + p[1]![0]!).toUpperCase();
    return s.slice(0, 2).toUpperCase();
}

export interface FavoriteItem {
    text: string;
    type: 'word' | 'sentence';
    translation?: string;
    pos?: string;
    example?: string;
    context?: string;
    phonetic?: string;
    createdAt: string;
}

export function AiChatPage() {
    const { addWord } = useWordBankStore();
    const markChatRoundDone = useDailyLoopStore((s) => s.markChatRoundDone);

    React.useEffect(() => {
        syncDailyLoopDate();
    }, []);
    const [persisted, setPersisted] = useLocalStorage<AiChatPersistedState>(
        'ai_chat_v2',
        migrateLegacyChatSessionsIfNeeded()
    );

    const chatMode = persisted.chatMode;
    const sessions = persisted.sessionsByMode[chatMode];
    const currentSessionId = persisted.currentSessionIdByMode[chatMode];

    const setChatMode = React.useCallback((mode: ChatMode) => {
        setPersisted((p) => ({ ...p, chatMode: mode }));
    }, [setPersisted]);

    const setCurrentSessionId = React.useCallback(
        (id: string | null) => {
            setPersisted((p) => ({
                ...p,
                currentSessionIdByMode: { ...p.currentSessionIdByMode, [p.chatMode]: id },
            }));
        },
        [setPersisted]
    );

    const selectSession = React.useCallback(
        (id: string) => {
            setCurrentSessionId(id);
            setSessionDrawerOpen(false);
        },
        [setCurrentSessionId]
    );

    const updateSession = React.useCallback(
        (sessionId: string, updates: Partial<Session>) => {
            setPersisted((p) => {
                const mode = p.chatMode;
                return {
                    ...p,
                    sessionsByMode: {
                        ...p.sessionsByMode,
                        [mode]: p.sessionsByMode[mode].map((s) =>
                            s.id === sessionId ? { ...s, ...updates, updatedAt: Date.now() } : s
                        ),
                    },
                };
            });
        },
        [setPersisted]
    );

    const [activeDropdown, setActiveDropdown] = React.useState<string | null>(null);
    const [isOpening, setIsOpening] = React.useState(false);
    const openingRunRef = React.useRef(0);
    
    // 1. 添加必需的状态
    const [selectionBox, setSelectionBox] = React.useState({ 
        show: false, 
        text: '', 
        context: '', 
        x: 0, 
        y: 0,
        translation: '',
        isLoading: false
    });

    const [input, setInput] = React.useState('');
    const [isLoading, setIsLoading] = React.useState(false);
    const [isCompletingWord, setIsCompletingWord] = React.useState(false);
    const [wordSaveBurstKey, setWordSaveBurstKey] = React.useState(0);
    const [sessionDrawerOpen, setSessionDrawerOpen] = React.useState(false);
    const [speakingMsgIndex, setSpeakingMsgIndex] = React.useState<number | null>(null);

    React.useEffect(() => () => stopSpeakEnglish(), []);

    const handleToggleSpeak = React.useCallback(
        (idx: number, text: string) => {
            if (speakingMsgIndex === idx) {
                stopSpeakEnglish();
                setSpeakingMsgIndex(null);
                return;
            }
            stopSpeakEnglish();
            setSpeakingMsgIndex(idx);
            void speakEnglish(text).finally(() =>
                setSpeakingMsgIndex((curr) => (curr === idx ? null : curr)),
            );
        },
        [speakingMsgIndex],
    );

    const [displayName] = useLocalStorage('lingovibe_display_name', '');
    const userInitials = userInitialsFromName(displayName);

    const appendFromVoice = React.useCallback((text: string) => {
        setInput((prev) => (prev ? `${prev.trimEnd()} ${text}` : text));
    }, []);

    const { listening, toggle: toggleMic, supported: speechSupported } = useEnglishSpeechRecognition(
        appendFromVoice,
        (m) => toast(m, 'error')
    );

    const messagesEndRef = React.useRef<HTMLDivElement>(null);
    const selectionChangeTimerRef = React.useRef<number | null>(null);
    const lastSelectionPopupKeyRef = React.useRef<{ key: string; at: number }>({ key: '', at: 0 });
    const { toast } = useToast();

    const emmaAvatar = "https://api.dicebear.com/7.x/avataaars/svg?seed=Emma&gender=female&backgroundColor=b6e3f4";

    const currentSession = sessions.find((s) => s.id === currentSessionId);
    const scene = CHAT_SCENARIO_BY_MODE[chatMode];
    const SceneIcon = scene.Icon;

    /** 当前模式下生成 Emma 主动开场（与生词本、时段联动） */
    React.useEffect(() => {
        if (!currentSessionId || !currentSession) return;
        if (currentSession.messages.length > 0) return;
        if (currentSession.openingPending !== true) return;

        const runId = ++openingRunRef.current;
        setIsOpening(true);

        (async () => {
            try {
                const freshWords = useWordBankStore.getState().words;
                const parsed = await fetchProactiveOpening(chatMode, freshWords);
                if (runId !== openingRunRef.current) return;
                const title =
                    parsed.content.length > 32 ? `${parsed.content.slice(0, 30)}...` : parsed.content || 'New Chat';
                updateSession(currentSession.id, {
                    messages: [
                        {
                            role: 'assistant',
                            content: parsed.content,
                            translation: parsed.translation,
                            correction: parsed.correction,
                            showTranslation: false,
                        },
                    ],
                    openingPending: false,
                    title,
                });
            } catch {
                if (runId !== openingRunRef.current) return;
                updateSession(currentSession.id, {
                    messages: [
                        {
                            role: 'assistant',
                            content: "Hey! I'm Emma — tell me anything and we'll chat in English.",
                            showTranslation: false,
                        },
                    ],
                    openingPending: false,
                    title: 'New Chat',
                });
            } finally {
                if (runId === openingRunRef.current) setIsOpening(false);
            }
        })();
    }, [
        chatMode,
        currentSession?.id,
        currentSession?.openingPending,
        currentSession?.messages.length,
        currentSessionId,
        updateSession,
    ]);

    const formatTimestamp = (timestamp: number) => {
        const date = new Date(timestamp);
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const day = date.getDate().toString().padStart(2, '0');
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        return `${month}-${day} ${hours}:${minutes}`;
    };

    const handleNewChat = () => {
        const newSession = createEmptySession();
        setPersisted((p) => ({
            ...p,
            sessionsByMode: {
                ...p.sessionsByMode,
                [p.chatMode]: [newSession, ...p.sessionsByMode[p.chatMode]],
            },
            currentSessionIdByMode: {
                ...p.currentSessionIdByMode,
                [p.chatMode]: newSession.id,
            },
        }));
        setSessionDrawerOpen(false);
    };

    const handleRenameSession = (sessionId: string) => {
        const session = sessions.find(s => s.id === sessionId);
        const newTitle = window.prompt("Enter new title:", session?.title);
        if (newTitle && newTitle.trim() !== '') {
            updateSession(sessionId, { title: newTitle });
        }
        setActiveDropdown(null);
    };

    const handleDeleteSession = (sessionId: string) => {
        setPersisted((p) => {
            const mode = p.chatMode;
            const list = p.sessionsByMode[mode];
            const sessionIndex = list.findIndex((s) => s.id === sessionId);
            const newSessions = list.filter((s) => s.id !== sessionId);
            let nextCurrent = p.currentSessionIdByMode[mode];
            if (nextCurrent === sessionId) {
                if (newSessions.length > 0) {
                    nextCurrent = newSessions[sessionIndex - 1]?.id || newSessions[0]?.id;
                } else {
                    const empty = createEmptySession();
                    return {
                        ...p,
                        sessionsByMode: { ...p.sessionsByMode, [mode]: [empty] },
                        currentSessionIdByMode: { ...p.currentSessionIdByMode, [mode]: empty.id },
                    };
                }
            }
            return {
                ...p,
                sessionsByMode: { ...p.sessionsByMode, [mode]: newSessions },
                currentSessionIdByMode: { ...p.currentSessionIdByMode, [mode]: nextCurrent },
            };
        });
        setActiveDropdown(null);
    };

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }

    React.useEffect(() => {
        scrollToBottom();
    }, [currentSession?.messages, isLoading, isOpening]);

    // 4. 完善消失逻辑（鼠标 + 触摸，避免手机划词后点空白关不掉）
    React.useEffect(() => {
        const handleClickOutside = (event: MouseEvent | TouchEvent) => {
            const target = event.target as HTMLElement;
            if (selectionBox.show && !target.closest('#selection-popup')) {
                setSelectionBox(prev => ({ ...prev, show: false, text: '', context: '', x: 0, y: 0, translation: '' }));
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('touchstart', handleClickOutside, { passive: true });
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('touchstart', handleClickOutside);
        };
    }, [selectionBox.show]);

    const handleSend = async () => {
        if (!input.trim() || !currentSessionId) return;

        const userMessage: Message = { role: 'user', content: input };
        const messagesForApi = [...(currentSession?.messages || []), userMessage];

        let newTitle = currentSession?.title ?? 'New Chat';
        if (currentSession?.title === 'New Chat') {
            newTitle = input.substring(0, 15) + (input.length > 15 ? '...' : '');
        }
        
        const updatedSession = { 
            ...currentSession!,
            messages: messagesForApi,
            title: newTitle,
            updatedAt: Date.now()
        };
        setPersisted((p) => {
            const mode = p.chatMode;
            const sid = p.currentSessionIdByMode[mode];
            return {
                ...p,
                sessionsByMode: {
                    ...p.sessionsByMode,
                    [mode]: p.sessionsByMode[mode].map((s) => (s.id === sid ? updatedSession : s)),
                },
            };
        });
        recordChatMessage();

        setInput('');
        setIsLoading(true);

        try {
            const { correction, content, translation } = await fetchEmmaChatCompletion(
                emmaSystemPrompt,
                messagesForApi.map((m) => ({ role: m.role, content: m.content }))
            );

            const assistantMessage = { role: 'assistant' as const, correction, content, translation, showTranslation: false };
            
            setPersisted((p) => {
                const mode = p.chatMode;
                const sid = p.currentSessionIdByMode[mode];
                return {
                    ...p,
                    sessionsByMode: {
                        ...p.sessionsByMode,
                        [mode]: p.sessionsByMode[mode].map((s) =>
                            s.id === sid
                                ? { ...s, messages: [...s.messages, assistantMessage], updatedAt: Date.now() }
                                : s
                        ),
                    },
                };
            });
            markChatRoundDone();

        } catch (error) {
            console.error(error);
            const msg = error instanceof Error ? error.message : '连接失败，请稍后重试';
            toast(msg, 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const toggleTranslation = async (messageIndex: number) => {
        if (!currentSession || !currentSessionId) return;
        const targetMessage = currentSession.messages[messageIndex];
        if (!targetMessage) return;
        /** 异步完成后用内容定位消息，避免 localStorage 同步导致下标错位把翻译贴到别的气泡上 */
        const targetFingerprint = { role: targetMessage.role, content: targetMessage.content };
        
        // 如果已经显示翻译，则直接切换隐藏
        if (targetMessage.showTranslation) {
            const updatedMessages = currentSession.messages.map((msg, i) => 
                i === messageIndex ? { ...msg, showTranslation: false } : msg
            );
            updateSession(currentSessionId, { messages: updatedMessages });
            return;
        }

        // 如果还没有翻译，且不是正在翻译中
        if (!targetMessage.translation && !targetMessage.isTranslating) {
            const translatingMessages = currentSession.messages.map((msg, i) => 
                i === messageIndex ? { ...msg, isTranslating: true, showTranslation: true } : msg
            );
            updateSession(currentSessionId, { messages: translatingMessages });

            try {
                const translation = await fetchEnglishToChineseTranslation(targetMessage.content);
                setPersisted((p) => {
                    const mode = p.chatMode;
                    const sid = p.currentSessionIdByMode[mode];
                    return {
                        ...p,
                        sessionsByMode: {
                            ...p.sessionsByMode,
                            [mode]: p.sessionsByMode[mode].map((s) =>
                                s.id === sid
                                    ? { ...s, messages: s.messages.map((msg) =>
                                          msg.role === targetFingerprint.role && msg.content === targetFingerprint.content
                                              ? { ...msg, translation, isTranslating: false } : msg
                                      ), updatedAt: Date.now() }
                                    : s
                            ),
                        },
                    };
                });
            } catch (error) {
                console.error('Translation error:', error);
                setPersisted((p) => {
                    const mode = p.chatMode;
                    const sid = p.currentSessionIdByMode[mode];
                    return {
                        ...p,
                        sessionsByMode: {
                            ...p.sessionsByMode,
                            [mode]: p.sessionsByMode[mode].map((s) =>
                                s.id === sid
                                    ? { ...s, messages: s.messages.map((msg) =>
                                          msg.role === targetFingerprint.role && msg.content === targetFingerprint.content
                                              ? { ...msg, isTranslating: false, translation: '翻译失败，请重试。' } : msg
                                      ), updatedAt: Date.now() }
                                    : s
                            ),
                        },
                    };
                });
            }
        } else {
            // 已有翻译，直接显示
            const updatedMessages = currentSession.messages.map((msg, i) => 
                i === messageIndex ? { ...msg, showTranslation: true } : msg
            );
            updateSession(currentSessionId, { messages: updatedMessages });
        }
    };



    // AI 自动补全单词信息（走后端代理，无需前端 key）
    const completeWordInfo = async (word: string, context: string) => {
        try {
            const data = await callAiProxy({
                messages: [
                    { 
                        role: 'system', 
                        content: '你是一个专业的英语单词本助手。请为用户提供的单词进行补全。你必须严格返回 JSON 格式，不要包含任何 markdown 代码块标识。' 
                    },
                    { 
                        role: 'user', 
                        content: `单词: "${word}"\n上下文: "${context}"\n请提供该词在此语境下的中文翻译、词性、该词的国际音标 (phonetic，例如 /dɪˈskʌsɪŋ/) 以及一个简单的英文例句。格式：{"translation": "...", "pos": "...", "phonetic": "...", "example": "..."}` 
                    }
                ],
                response_format: { type: 'json_object' }
            });
            const raw = (data as any)?.choices?.[0]?.message?.content;
            return JSON.parse(raw);
        } catch (e) {
            console.error('Word completion error:', e);
            toast("AI 补全失败，已存入基本信息", "error");
            return null;
        }
    };

    const translatePhrase = React.useCallback(async (text: string, context: string) => {
        try {
            const data = await callAiProxy({
                messages: [
                    { 
                        role: 'system', 
                        content: 'You are a professional translator. Translate the given English phrase briefly and accurately into Chinese based on its context. Return ONLY the translation text.' 
                    },
                    { role: 'user', content: `Phrase: "${text}"\nContext: "${context}"` }
                ],
                max_tokens: 50,
                temperature: 0.2,
            });
            const translation = String((data as any)?.choices?.[0]?.message?.content ?? '').trim();
            setSelectionBox(prev => ({ ...prev, translation, isLoading: false }));
        } catch (error) {
            console.error('Translation error:', error);
            setSelectionBox(prev => ({ ...prev, translation: '翻译失败', isLoading: false }));
        }
    }, []);

    /** 桌面 mouseup / 移动 touchend 后 selection 才稳定，需延迟读取 */
    const openSelectionPopupIfAny = React.useCallback(() => {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;

        const text = selection.toString().trim();
        if (!text || text.length > 400) return;

        const anchor = selection.anchorNode;
        const el =
            anchor?.nodeType === Node.TEXT_NODE
                ? (anchor.parentElement as HTMLElement | null)
                : (anchor as HTMLElement | null);
        const messageBubble = el?.closest('.message-content');
        if (!messageBubble) return;

        const context = messageBubble.textContent || '';
        const dedupeKey = `${text}::${context.slice(0, 120)}`;
        const now = Date.now();
        if (
            lastSelectionPopupKeyRef.current.key === dedupeKey &&
            now - lastSelectionPopupKeyRef.current.at < 900
        ) {
            return;
        }
        lastSelectionPopupKeyRef.current = { key: dedupeKey, at: now };

        let range: Range;
        try {
            range = selection.getRangeAt(0);
        } catch {
            return;
        }
        const rect = range.getBoundingClientRect();
        if (rect.width < 1 && rect.height < 1) return;

        setSelectionBox({
            show: true,
            text,
            context,
            x: rect.left + rect.width / 2,
            y: rect.top,
            translation: '',
            isLoading: true,
        });
        translatePhrase(text, context);
    }, [translatePhrase]);

    const handleTextSelectGestureEnd = React.useCallback(
        (event: React.MouseEvent | React.TouchEvent) => {
            const t = event.target as HTMLElement;
            if (t.closest('#selection-popup')) return;
            const delay = event.type === 'touchend' ? 280 : 0;
            window.setTimeout(() => openSelectionPopupIfAny(), delay);
        },
        [openSelectionPopupIfAny]
    );

    React.useEffect(() => {
        const onSelectionChange = () => {
            if (selectionChangeTimerRef.current) window.clearTimeout(selectionChangeTimerRef.current);
            selectionChangeTimerRef.current = window.setTimeout(() => {
                selectionChangeTimerRef.current = null;
                const sel = window.getSelection();
                if (!sel || sel.isCollapsed || !sel.toString().trim()) return;
                openSelectionPopupIfAny();
            }, 220);
        };
        document.addEventListener('selectionchange', onSelectionChange);
        return () => {
            document.removeEventListener('selectionchange', onSelectionChange);
            if (selectionChangeTimerRef.current) window.clearTimeout(selectionChangeTimerRef.current);
        };
    }, [openSelectionPopupIfAny]);

    // 4. 完善保存逻辑
    const handleSaveSelection = async () => {
        let { text, context } = selectionBox;
        text = text.trim();
        if (!text.includes(' ')) {
            text = text.replace(/^[^a-zA-Z']+/, '').replace(/[^a-zA-Z']+$/, '');
        }
        if (!text) {
            toast('请先选中有效的英文单词或短语', 'error');
            return;
        }
        // 立即清除划词状态
        window.getSelection()?.removeAllRanges();
        setSelectionBox(prev => ({ ...prev, show: false, text: '', context: '', x: 0, y: 0, translation: '' }));
        
        setIsCompletingWord(true);
        toast("Emma 正在为你智能补全单词卡片...", "default");
        
        const aiInfo = await completeWordInfo(text, context);

        await addWord({
            word: text,
            type: text.split(/\s+/).length <= 3 ? 'word' : 'sentence',
            context: context.substring(0, 200), // 截取避免过长
            translation: aiInfo?.translation || '',
            phonetic: aiInfo?.phonetic || '',
            pos: aiInfo?.pos || 'unknown',
            exampleSentence: aiInfo?.example || '',
        });
        toast(`已添加到生词本${text.split(/\s+/).length <= 3 ? '单词' : '句子'}: ${text}`, "success");
        setWordSaveBurstKey((k) => k + 1);

        setIsCompletingWord(false);
    };

    const lifetime = useLearningAnalyticsStore((s) => s.lifetime);
    const wordCount = useWordBankStore((s) => s.words.filter((w) => w.type === 'word').length);
    const totalInteractions = lifetime.chatMessages + lifetime.srsReviews + lifetime.readingSessions + lifetime.visualLookups;
    const insightFlow = totalInteractions > 0 ? Math.min(99, Math.round((lifetime.chatMessages / totalInteractions) * 100)) : 0;

    return (
        <>
            {/* 划词浮层：玻璃拟态 */}
            {selectionBox.show && (
                <div
                    id="selection-popup"
                    className="fixed z-[100] transform -translate-x-1/2 -translate-y-full mb-2 animate-in fade-in zoom-in-95 duration-200"
                    style={{ left: selectionBox.x, top: selectionBox.y }}
                >
                    <div className="min-w-[140px] max-w-[260px] overflow-hidden rounded-2xl border border-white/70 bg-white/85 shadow-2xl shadow-slate-900/15 backdrop-blur-xl backdrop-saturate-150 dark:border-white/[0.12] dark:bg-slate-900/75 dark:shadow-[0_24px_64px_-12px_rgba(0,0,0,0.75),0_0_0_1px_rgba(255,255,255,0.06)_inset] dark:backdrop-blur-2xl dark:backdrop-saturate-150">
                        <div className="p-3.5 space-y-2.5">
                            <div className="flex flex-col gap-1">
                                <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400 dark:text-slate-500">Selected</span>
                                <p className="text-xs font-semibold italic leading-snug text-slate-800 dark:text-slate-100">"{selectionBox.text}"</p>
                            </div>
                            <div className="h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent dark:via-white/10" />
                            <div className="flex flex-col gap-1">
                                <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-indigo-500 dark:text-indigo-400">Translation</span>
                                {selectionBox.isLoading ? (
                                    <div className="flex items-center gap-2 py-1">
                                        <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-400" />
                                        <span className="text-[10px] text-slate-400 dark:text-slate-500">Translating…</span>
                                    </div>
                                ) : (
                                    <p className="text-xs font-medium leading-relaxed text-indigo-900/90 dark:text-indigo-100/90">
                                        {selectionBox.translation || '…'}
                                    </p>
                                )}
                            </div>
                        </div>
                        <div className="relative border-t border-white/50 dark:border-white/[0.08]">
                            <motion.button
                                type="button"
                                onClick={handleSaveSelection}
                                disabled={isCompletingWord}
                                whileTap={isCompletingWord ? undefined : { scale: 0.985 }}
                                transition={{ type: 'spring', stiffness: 520, damping: 32 }}
                                className={cn(
                                    'relative z-0 flex w-full items-center justify-center gap-1.5 py-2.5 text-[10px] font-bold uppercase tracking-wider transition-colors',
                                    isCompletingWord
                                        ? 'cursor-not-allowed bg-slate-100/50 text-slate-300 dark:bg-slate-800/40 dark:text-slate-600'
                                        : 'bg-white/40 text-slate-600 hover:bg-indigo-50/80 hover:text-indigo-700 dark:bg-white/[0.06] dark:text-slate-300 dark:hover:bg-indigo-500/15 dark:hover:text-indigo-300'
                                )}
                            >
                                {isCompletingWord ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BookOpen className="h-3.5 w-3.5" />}
                                {isCompletingWord ? '保存中…' : '加入生词本'}
                            </motion.button>
                            <WordCollectParticleBurst burstKey={wordSaveBurstKey} />
                        </div>
                    </div>
                </div>
            )}

            <div className="relative flex h-[calc(100dvh-5.5rem)] w-full min-h-0 flex-col overflow-hidden rounded-2xl border border-stitch-outline/15 bg-stitch-surface shadow-stitch-card md:h-[calc(100vh-8rem)] md:rounded-3xl">
                <div className="relative z-10 shrink-0 border-b border-stitch-outline/10 bg-stitch-surface-container-low/90 px-2 py-2 sm:px-4 sm:py-3 md:px-6">
                    <div className="grid w-full grid-cols-3 gap-1 rounded-2xl border border-stitch-outline/10 bg-stitch-surface-container-highest/40 p-1 md:flex md:w-auto md:flex-row md:flex-wrap">
                        {(
                            [
                                {
                                    id: 'vocabulary' as const,
                                    label: '生词破冰',
                                    sub: 'Vocabulary Focus',
                                    icon: BookOpen,
                                },
                                {
                                    id: 'casual' as const,
                                    label: '日常陪伴',
                                    sub: 'Casual Catch-up',
                                    icon: Coffee,
                                },
                                {
                                    id: 'surprise' as const,
                                    label: '顺其自然',
                                    sub: 'Surprise Me',
                                    icon: Sparkles,
                                },
                            ] as const
                        ).map((tab) => {
                            const Icon = tab.icon;
                            const active = chatMode === tab.id;
                            return (
                                <button
                                    key={tab.id}
                                    type="button"
                                    onClick={() => setChatMode(tab.id)}
                                    className={cn(
                                        'flex min-w-0 flex-col items-center gap-0.5 rounded-lg px-2 py-2 text-center transition-all duration-200 sm:flex-row sm:gap-2 sm:rounded-xl sm:px-3 sm:text-left md:min-w-[148px]',
                                        active
                                            ? 'bg-white text-stitch-on-surface shadow-sm ring-1 ring-stitch-outline/15'
                                            : 'text-stitch-on-surface-variant hover:bg-white/60 hover:text-stitch-on-surface'
                                    )}
                                >
                                    <span
                                        className={cn(
                                            'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors',
                                            active
                                                ? 'bg-stitch-primary/10 text-stitch-primary'
                                                : 'bg-stitch-surface-container-high/80 text-stitch-on-surface-variant'
                                        )}
                                    >
                                        <Icon className="h-4 w-4" />
                                    </span>
                                    <span className="flex flex-col leading-tight">
                                        <span
                                            className={cn(
                                                'text-xs font-bold tracking-tight',
                                                active ? 'text-stitch-on-surface' : 'text-stitch-on-surface-variant'
                                            )}
                                        >
                                            {tab.label}
                                        </span>
                                        <span className="hidden text-[10px] font-medium text-stitch-on-surface-variant sm:block">{tab.sub}</span>
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                    <p className="mt-2 line-clamp-2 max-w-3xl text-[10px] font-medium leading-relaxed text-stitch-on-surface-variant sm:mt-2.5 sm:line-clamp-none sm:text-[11px]">
                        {
                            (
                                [
                                    '让 AI 用你最近收藏的生词开启今天的话题吧！',
                                    '没有任何学习压力，就像老朋友一样随便聊聊现在的时光。',
                                    '让 AI 自己决定今天聊什么！',
                                ] as const
                            )[chatMode === 'vocabulary' ? 0 : chatMode === 'casual' ? 1 : 2]
                        }
                    </p>
                </div>

                <div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row">
                {sessionDrawerOpen && (
                    <button
                        type="button"
                        aria-label="关闭对话列表"
                        className="fixed inset-0 z-[55] bg-black/45 backdrop-blur-[1px] md:hidden"
                        onClick={() => setSessionDrawerOpen(false)}
                    />
                )}
                {/* 左侧会话坞：移动端抽屉，桌面固定侧栏 */}
                <div
                    className={cn(
                        'flex min-h-0 flex-col border-white/50 bg-slate-950/[0.04] backdrop-blur-md dark:border-white/[0.06] dark:bg-slate-950/50 dark:backdrop-blur-xl dark:backdrop-saturate-125',
                        'fixed inset-y-0 left-0 z-[60] h-full w-[min(20rem,90vw)] border-r md:static md:z-auto md:flex md:h-auto md:w-[26%] md:min-w-[200px] md:max-w-[320px]',
                        sessionDrawerOpen ? 'flex' : 'hidden md:flex'
                    )}
                >
                    <div className="border-b border-white/40 p-3 dark:border-white/[0.06]">
                        <Button
                            onClick={handleNewChat}
                            className="h-11 w-full gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 font-semibold text-white shadow-lg shadow-indigo-500/25 transition hover:from-indigo-500 hover:to-violet-500 hover:shadow-indigo-500/35"
                        >
                            <Plus className="h-4 w-4" />
                            发起新对话
                        </Button>
                    </div>
                    <div className="flex-1 space-y-1 overflow-y-auto p-2.5">
                        {[...sessions].sort((a, b) => b.updatedAt - a.updatedAt).map(session => (
                            <div key={session.id} className="group relative">
                                <button 
                                    type="button"
                                    onClick={() => selectSession(session.id)}
                                    className={cn(
                                        "flex w-full flex-col items-start rounded-xl p-3 text-left transition-all duration-200",
                                        currentSessionId === session.id
                                            ? "bg-white/90 shadow-md shadow-slate-900/8 ring-1 ring-indigo-200/60 dark:bg-slate-800/70 dark:shadow-[0_6px_24px_-4px_rgba(0,0,0,0.55)] dark:ring-indigo-400/25"
                                            : "hover:bg-white/60 dark:hover:bg-white/[0.05]"
                                    )}
                                >
                                    <span className={cn(
                                        "w-full truncate text-[13px] font-semibold tracking-tight",
                                        currentSessionId === session.id
                                            ? "text-indigo-950 dark:text-indigo-100"
                                            : "text-slate-700 dark:text-slate-300"
                                    )}>{session.title}</span>
                                    <span className="mt-1 font-mono text-[10px] tabular-nums text-slate-400 dark:text-slate-500">{formatTimestamp(session.updatedAt)}</span>
                                </button>
                                <div className="absolute right-1.5 top-1/2 -translate-y-1/2 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
                                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg bg-white/80 text-slate-500 shadow-sm hover:text-slate-900 dark:bg-slate-800/80 dark:text-slate-400 dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] dark:hover:text-slate-100" onClick={() => setActiveDropdown(activeDropdown === session.id ? null : session.id)}>
                                        <MoreVertical className="h-4 w-4" />
                                    </Button>
                                    {activeDropdown === session.id && (
                                        <div className="absolute right-0 top-full z-20 mt-1 w-36 overflow-hidden rounded-xl border border-white/80 bg-white/95 text-sm shadow-xl shadow-slate-900/15 backdrop-blur-xl dark:border-white/[0.1] dark:bg-slate-900/85 dark:text-slate-200 dark:shadow-[0_16px_48px_-8px_rgba(0,0,0,0.7),0_0_0_1px_rgba(255,255,255,0.05)_inset] dark:backdrop-blur-2xl">
                                            <button onClick={() => handleRenameSession(session.id)} className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-white/[0.06]"><Pencil className="h-3.5 w-3.5"/> 重命名</button>
                                            <button onClick={() => handleDeleteSession(session.id)} className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"><Trash2 className="h-3.5 w-3.5"/> 删除</button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {currentSession ? (
                    <div className="flex min-h-0 min-w-0 flex-1 flex-col md:flex-row">
                        <div
                            className="relative flex min-h-0 min-w-0 flex-1 flex-col"
                            onMouseUp={handleTextSelectGestureEnd}
                            onTouchEnd={handleTextSelectGestureEnd}
                        >
                            <header className="flex h-auto min-h-[4.5rem] shrink-0 flex-wrap items-center justify-between gap-3 border-b border-stitch-outline/10 bg-stitch-surface-container-low px-4 py-3 sm:px-8 sm:py-4">
                                <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="h-9 shrink-0 gap-1 border-stitch-outline/20 bg-white px-2 text-xs md:hidden"
                                        onClick={() => setSessionDrawerOpen(true)}
                                    >
                                        <Menu className="h-4 w-4" />
                                        对话
                                    </Button>
                                    <div className="rounded-xl border border-stitch-outline/10 bg-white p-2.5 shadow-sm">
                                        <SceneIcon className="h-5 w-5 text-stitch-primary" strokeWidth={2} />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="mb-0.5 text-[10px] font-bold uppercase tracking-widest text-stitch-on-surface-variant/60">
                                            Current Scenario
                                        </p>
                                        <h2 className="font-headline text-base font-bold leading-none text-stitch-on-surface sm:text-lg">
                                            {scene.scenario}
                                        </h2>
                                    </div>
                                </div>
                                <div className="flex flex-wrap items-center gap-4 sm:gap-6">
                                    <div className="flex flex-col items-end text-right">
                                        <span className="text-[10px] font-bold uppercase tracking-wider text-stitch-secondary">
                                            {scene.focusLine}
                                        </span>
                                        <span className="text-sm font-semibold text-stitch-on-surface">{scene.focusSub}</span>
                                    </div>
                                    <div className="hidden h-10 w-px bg-stitch-outline/20 sm:block" />
                                    <div className="flex -space-x-2">
                                        <Avatar className="h-10 w-10 border-2 border-white shadow-sm">
                                            <AvatarImage src={emmaAvatar} className="object-cover" />
                                            <AvatarFallback className="bg-stitch-primary text-xs text-white">EM</AvatarFallback>
                                        </Avatar>
                                        <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-white bg-stitch-surface-container-highest text-xs font-bold text-stitch-primary shadow-sm">
                                            AI
                                        </div>
                                    </div>
                                </div>
                            </header>

                            <div
                                className="relative flex-1 space-y-6 overflow-y-auto bg-stitch-surface px-4 py-6 sm:space-y-8 sm:px-8 sm:py-8"
                            >
                                <div className="relative mx-auto flex w-full max-w-2xl flex-col space-y-8 px-1">
                                    {isOpening && currentSession.messages.length === 0 && (
                                        <div className="flex max-w-2xl gap-4">
                                            <Avatar className="mt-1 h-10 w-10 shrink-0 border border-stitch-outline/10 shadow-sm">
                                                <AvatarImage src={emmaAvatar} />
                                                <AvatarFallback className="bg-stitch-primary text-xs text-white">EM</AvatarFallback>
                                            </Avatar>
                                            <div className="flex items-center gap-3 rounded-2xl rounded-tl-none border border-stitch-outline/10 bg-stitch-surface-container-lowest px-5 py-4 shadow-sm">
                                                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-stitch-primary" />
                                                <span className="text-sm font-medium text-stitch-on-surface-variant">
                                                    Emma 正在根据当前模式向你搭话…
                                                </span>
                                            </div>
                                        </div>
                                    )}
                                    {currentSession.messages.map((msg, index) => {
                                        const prev = index > 0 ? currentSession.messages[index - 1] : undefined;
                                        const next = currentSession.messages[index + 1];
                                        if (msg.role === 'user') {
                                            const grammarFromAssistant =
                                                next?.role === 'assistant' && next.correction?.trim()
                                                    ? next.correction.trim()
                                                    : null;
                                            return (
                                                <div
                                                    key={`${index}-user-${msg.content?.slice(0, 24) ?? ''}`}
                                                    className="flex max-w-2xl flex-row-reverse gap-4 self-end"
                                                >
                                                    <div className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-stitch-primary-fixed font-bold text-stitch-on-primary-fixed">
                                                        {userInitials}
                                                    </div>
                                                    <div className="min-w-0 space-y-3 text-right">
                                                        <div className="message-content rounded-2xl rounded-tr-none bg-stitch-primary px-5 py-4 text-left shadow-md">
                                                            <p className="text-[15px] font-medium leading-relaxed text-white">
                                                                {msg.content}
                                                            </p>
                                                        </div>
                                                        {grammarFromAssistant ? (
                                                            <div className="rounded-xl border border-stitch-secondary/10 bg-stitch-secondary-container/30 p-4 text-left backdrop-blur-sm">
                                                                <div className="mb-2 flex items-center gap-2">
                                                                    <Sparkle className="h-4 w-4 text-stitch-secondary" />
                                                                    <span className="text-[10px] font-black uppercase tracking-widest text-stitch-secondary">
                                                                        Grammar Suggestion
                                                                    </span>
                                                                </div>
                                                                <p className="text-xs leading-relaxed text-stitch-on-secondary-fixed-variant">
                                                                    {grammarFromAssistant}
                                                                </p>
                                                            </div>
                                                        ) : null}
                                                    </div>
                                                </div>
                                            );
                                        }
                                        const showCorrectionBelowAssistant =
                                            !!msg.correction?.trim() && prev?.role !== 'user';
                                        return (
                                            <div
                                                key={`${index}-asst-${msg.content?.slice(0, 24) ?? ''}`}
                                                className="flex max-w-2xl gap-4"
                                            >
                                                <Avatar className="mt-1 h-10 w-10 shrink-0 border border-stitch-outline/10 shadow-sm">
                                                    <AvatarImage src={emmaAvatar} />
                                                    <AvatarFallback className="bg-stitch-primary text-xs text-white">EM</AvatarFallback>
                                                </Avatar>
                                                <div className="min-w-0 space-y-3">
                                                    <div className="message-content rounded-2xl rounded-tl-none border border-stitch-outline/5 bg-stitch-surface-container-lowest px-5 py-4 shadow-sm">
                                                        <p className="text-[15px] font-medium leading-relaxed text-stitch-on-surface">
                                                            {msg.content}
                                                        </p>
                                                        <div className="mt-4 flex flex-wrap items-center gap-3">
                                                            <button
                                                                type="button"
                                                                onClick={() => handleToggleSpeak(index, msg.content)}
                                                                className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-bold text-stitch-primary transition-colors hover:bg-stitch-primary/5"
                                                                aria-label={speakingMsgIndex === index ? '停止朗读' : '朗读'}
                                                            >
                                                                {speakingMsgIndex === index ? (
                                                                    <Square className="h-4 w-4" />
                                                                ) : (
                                                                    <Volume2 className="h-4 w-4" />
                                                                )}
                                                                {speakingMsgIndex === index ? '停止' : '听'}
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => void toggleTranslation(index)}
                                                                className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-bold text-stitch-on-surface-variant/70 transition-colors hover:bg-black/5"
                                                            >
                                                                <Languages className="h-4 w-4" />
                                                                {msg.showTranslation ? '隐藏翻译' : '翻译'}
                                                            </button>
                                                        </div>
                                                    </div>
                                                    {msg.showTranslation ? (
                                                        <div className="rounded-xl border border-stitch-primary-fixed/40 bg-stitch-primary-fixed/25 px-4 py-3 text-sm italic leading-relaxed text-stitch-on-surface">
                                                            {msg.isTranslating ? (
                                                                <div className="flex items-center gap-2 not-italic">
                                                                    <Loader2 className="h-4 w-4 animate-spin text-stitch-primary" />
                                                                    <span className="text-xs text-stitch-on-surface-variant">
                                                                        翻译中…
                                                                    </span>
                                                                </div>
                                                            ) : (
                                                                msg.translation || '暂无法翻译。'
                                                            )}
                                                        </div>
                                                    ) : null}
                                                    {showCorrectionBelowAssistant ? (
                                                        <div className="rounded-xl border border-stitch-secondary/10 bg-stitch-secondary-container/30 p-4 backdrop-blur-sm">
                                                            <div className="mb-2 flex items-center gap-2">
                                                                <Sparkle className="h-4 w-4 text-stitch-secondary" />
                                                                <span className="text-[10px] font-black uppercase tracking-widest text-stitch-secondary">
                                                                    Grammar Suggestion
                                                                </span>
                                                            </div>
                                                            <p className="text-xs leading-relaxed text-stitch-on-secondary-fixed-variant">
                                                                {msg.correction!.trim()}
                                                            </p>
                                                        </div>
                                                    ) : null}
                                                </div>
                                            </div>
                                        );
                                    })}
                                    {isLoading && (
                                        <div className="flex max-w-2xl gap-4">
                                            <Avatar className="mt-1 h-10 w-10 shrink-0 border border-stitch-outline/10 shadow-sm">
                                                <AvatarImage src={emmaAvatar} />
                                                <AvatarFallback>EM</AvatarFallback>
                                            </Avatar>
                                            <div className="flex items-center gap-3 rounded-2xl rounded-tl-none border border-stitch-outline/10 bg-stitch-surface-container-lowest px-5 py-4 shadow-sm">
                                                <Loader2 className="h-4 w-4 animate-spin text-stitch-primary" />
                                                <span className="text-sm font-medium text-stitch-on-surface-variant">
                                                    Emma is thinking…
                                                </span>
                                            </div>
                                        </div>
                                    )}
                                    <div ref={messagesEndRef} />
                                </div>
                            </div>

                            <footer className="shrink-0 border-t border-stitch-outline/10 bg-stitch-surface-container-low/50 p-4 backdrop-blur-md sm:p-6">
                                <div className="mx-auto flex max-w-4xl items-center gap-3 rounded-2xl border border-stitch-outline/15 bg-stitch-surface-container-lowest p-2 shadow-lg">
                                    <button
                                        type="button"
                                        aria-label={listening ? '停止语音输入' : '语音输入'}
                                        disabled={!speechSupported || isLoading || isOpening}
                                        onClick={() => toggleMic()}
                                        className={cn(
                                            'shrink-0 rounded-xl p-3 text-stitch-on-surface-variant transition-colors hover:text-stitch-primary',
                                            listening && 'text-stitch-primary ring-2 ring-stitch-primary/30',
                                            !speechSupported && 'cursor-not-allowed opacity-40'
                                        )}
                                    >
                                        <Mic className="h-5 w-5" />
                                    </button>
                                    <textarea
                                        value={input}
                                        onChange={(e) => setInput(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' && !e.shiftKey) {
                                                e.preventDefault();
                                                void handleSend();
                                            }
                                        }}
                                        placeholder="Type your response here…"
                                        disabled={
                                            isLoading ||
                                            isOpening ||
                                            (!!currentSession?.openingPending && currentSession.messages.length === 0)
                                        }
                                        rows={1}
                                        className="max-h-36 min-h-[48px] flex-1 resize-none border-0 bg-transparent py-3 text-[15px] font-medium text-stitch-on-surface placeholder:text-stitch-on-surface-variant/40 focus:outline-none focus:ring-0 disabled:cursor-not-allowed disabled:opacity-45"
                                    />
                                    <div className="flex shrink-0 items-center gap-1 pr-1">
                                        <button
                                            type="button"
                                            disabled
                                            title="即将支持"
                                            className="rounded-xl p-2 text-stitch-on-surface-variant/50"
                                        >
                                            <ImageIcon className="h-5 w-5" />
                                        </button>
                                        <Button
                                            type="button"
                                            onClick={() => void handleSend()}
                                            disabled={
                                                isLoading ||
                                                isOpening ||
                                                !input.trim() ||
                                                (!!currentSession?.openingPending &&
                                                    currentSession.messages.length === 0)
                                            }
                                            className="h-11 rounded-xl bg-stitch-primary px-3 text-white shadow-sm transition hover:bg-stitch-primary-container active:scale-95 disabled:opacity-40"
                                        >
                                            <Send className="h-5 w-5" />
                                        </Button>
                                    </div>
                                </div>
                                <p className="mt-3 text-center text-[10px] font-bold uppercase tracking-tighter text-stitch-on-surface-variant/40">
                                    Enter 发送 · 麦克风英文听写
                                    {!speechSupported ? '（当前环境不支持语音识别）' : null}
                                </p>
                            </footer>
                        </div>
                        <aside className="hidden w-80 shrink-0 flex-col gap-6 overflow-y-auto border-l border-stitch-outline/10 bg-stitch-surface-container-low p-6 xl:flex">
                            <h3 className="mb-2 text-sm font-black uppercase tracking-widest text-stitch-on-surface-variant">
                                Practice Insights
                            </h3>
                            <div className="rounded-xl border border-stitch-outline/5 bg-stitch-surface-container-lowest p-5 shadow-sm">
                                <div className="mb-4 flex items-center justify-between">
                                    <span className="text-xs font-bold text-stitch-on-surface-variant">Conversation Flow</span>
                                    <span className="text-xs font-black text-stitch-secondary">{insightFlow}%</span>
                                </div>
                                <div className="h-2 w-full overflow-hidden rounded-full bg-stitch-surface-container-highest">
                                    <div
                                        className="h-full rounded-full bg-stitch-secondary"
                                        style={{ width: `${insightFlow}%` }}
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="flex flex-col gap-2 rounded-xl bg-stitch-primary-fixed/30 p-4">
                                    <BookOpen className="h-5 w-5 text-stitch-primary" />
                                    <div>
                                        <p className="text-[10px] font-bold uppercase text-stitch-primary/70">Words</p>
                                        <p className="text-xl font-black text-stitch-primary">{wordCount}</p>
                                    </div>
                                </div>
                                <div className="flex flex-col gap-2 rounded-xl bg-stitch-tertiary-fixed/30 p-4">
                                    <Bolt className="h-5 w-5 text-stitch-tertiary" />
                                    <div>
                                        <p className="text-[10px] font-bold uppercase text-stitch-tertiary/70">Chats</p>
                                        <p className="text-xl font-black text-stitch-tertiary">{lifetime.chatMessages}</p>
                                    </div>
                                </div>
                            </div>
                            <div className="mt-auto rounded-xl border border-stitch-outline/10 bg-stitch-surface-container-highest/50 p-5">
                                <div className="mb-3 flex items-center gap-2">
                                    <Lightbulb className="text-lg text-stitch-secondary" />
                                    <span className="text-xs font-black uppercase tracking-widest text-stitch-on-surface">
                                        Tutor&apos;s Tip
                                    </span>
                                </div>
                                <p className="text-xs italic leading-relaxed text-stitch-on-surface-variant">
                                    {scene.focusSub.includes('点餐')
                                        ? "在餐厅场景里，用 I'll have… 或 Could I get… 比直说 I want… 更地道。"
                                        : '保持句子简短、先听懂再回答，对话会更顺畅。'}
                                </p>
                            </div>
                        </aside>
                    </div>
                    ) : (
                        <div className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col items-center justify-center overflow-hidden bg-stitch-surface px-6 text-center">
                            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(99,102,241,0.08),_transparent_65%)] dark:bg-[radial-gradient(ellipse_at_center,_rgba(129,140,248,0.18),_transparent_60%)]" />
                            <div className="relative rounded-3xl border border-white/80 bg-white/60 p-10 shadow-xl shadow-indigo-500/10 backdrop-blur-md dark:border-white/[0.1] dark:bg-slate-900/55 dark:shadow-[0_20px_60px_-20px_rgba(0,0,0,0.65),inset_0_1px_0_0_rgba(255,255,255,0.08)] dark:backdrop-blur-xl">
                                <MessageSquare className="mx-auto mb-4 h-14 w-14 text-indigo-400/80 dark:text-indigo-400/70" />
                                <h2 className="text-lg font-bold tracking-tight text-slate-900 dark:text-slate-50">开始一段对话</h2>
                                <p className="mt-2 max-w-xs px-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">点击顶部「对话」打开列表，再点「发起新对话」；桌面端在左侧侧栏操作。</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}
