import * as React from 'react';
import { Send, Mic, Loader2, Languages, Plus, MessageSquare, Trash2, MoreVertical, Pencil, BookOpen, Coffee, Sparkles, Menu } from 'lucide-react';
import { useLocalStorage } from "@/hooks/use-local-storage";
import { useWordBankStore } from "@/store/wordBankStore";
import {
    type ChatMode,
    type Session,
    type Message,
    emmaSystemPrompt,
    createEmptySession,
    migrateLegacyChatSessionsIfNeeded,
    parseEmmaResponse,
    fetchProactiveOpening,
    type AiChatPersistedState,
} from '@/lib/ai-chat';
import { cn } from '@/lib/utils';
import { recordChatMessage } from '@/store/learningAnalyticsStore';
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

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
    const [apiKey] = useLocalStorage('chat_api_key', '');
    const { addWord } = useWordBankStore();
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
    const [sessionDrawerOpen, setSessionDrawerOpen] = React.useState(false);

    const messagesEndRef = React.useRef<HTMLDivElement>(null);
    const selectionChangeTimerRef = React.useRef<number | null>(null);
    const lastSelectionPopupKeyRef = React.useRef<{ key: string; at: number }>({ key: '', at: 0 });
    const { toast } = useToast();

    const emmaAvatar = "https://api.dicebear.com/7.x/avataaars/svg?seed=Emma&gender=female&backgroundColor=b6e3f4";

    const currentSession = sessions.find((s) => s.id === currentSessionId);

    /** 当前模式下生成 Emma 主动开场（与生词本、时段联动） */
    React.useEffect(() => {
        if (!apiKey || !currentSessionId || !currentSession) return;
        if (currentSession.messages.length > 0) return;
        if (currentSession.openingPending !== true) return;

        const runId = ++openingRunRef.current;
        setIsOpening(true);

        (async () => {
            try {
                const freshWords = useWordBankStore.getState().words;
                const parsed = await fetchProactiveOpening(apiKey, chatMode, freshWords);
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
        apiKey,
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
        if (!apiKey) {
            toast("请先在设置页面填写 DeepSeek API Key。", "error");
            return;
        }

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
            const response = await fetch('https://api.deepseek.com/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                body: JSON.stringify({
                    model: 'deepseek-chat',
                    messages: [emmaSystemPrompt, ...messagesForApi.map((m) => ({ role: m.role, content: m.content }))],
                })
            });

            if (!response.ok) throw new Error(`API request failed`);

            const data = await response.json();
            const rawContent = data.choices[0].message.content;
            const { correction, content, translation } = parseEmmaResponse(rawContent);
            
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

        } catch (error) {
            console.error(error);
            toast("连接失败，请检查 API Key 或网络", "error");
        } finally {
            setIsLoading(false);
        }
    };

    const toggleTranslation = async (messageIndex: number) => {
        if (!currentSession || !currentSessionId) return;
        const targetMessage = currentSession.messages[messageIndex];
        
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
            if (!apiKey) {
                toast("请先设置 API Key", "error");
                return;
            }

            // 先将状态设置为“正在翻译”并显示气泡
            const translatingMessages = currentSession.messages.map((msg, i) => 
                i === messageIndex ? { ...msg, isTranslating: true, showTranslation: true } : msg
            );
            updateSession(currentSessionId, { messages: translatingMessages });

            try {
                const response = await fetch('https://api.deepseek.com/chat/completions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                    body: JSON.stringify({
                        model: 'deepseek-chat',
                        messages: [
                            { 
                                role: 'system', 
                                content: 'Translate the following English text into natural conversational Chinese. Return ONLY the Chinese translation without any quotes or extra text.' 
                            },
                            { 
                                role: 'user', 
                                content: targetMessage.content 
                            }
                        ],
                        max_tokens: 300
                    })
                });

                if (response.ok) {
                    const data = await response.json();
                    const translation = data.choices[0].message.content.trim();
                    
                    setPersisted((p) => {
                        const mode = p.chatMode;
                        const sid = p.currentSessionIdByMode[mode];
                        return {
                            ...p,
                            sessionsByMode: {
                                ...p.sessionsByMode,
                                [mode]: p.sessionsByMode[mode].map((s) =>
                                    s.id === sid
                                        ? {
                                              ...s,
                                              messages: s.messages.map((msg, i) =>
                                                  i === messageIndex
                                                      ? { ...msg, translation, isTranslating: false }
                                                      : msg
                                              ),
                                              updatedAt: Date.now(),
                                          }
                                        : s
                                ),
                            },
                        };
                    });
                } else {
                    throw new Error("Translation failed");
                }
            } catch (error) {
                console.error('Full translation error:', error);
                const errorMessages = currentSession.messages.map((msg, i) => 
                    i === messageIndex ? { ...msg, isTranslating: false, translation: '翻译失败，请重试。' } : msg
                );
                updateSession(currentSessionId, { messages: errorMessages });
            }
        } else {
            // 已有翻译，直接显示
            const updatedMessages = currentSession.messages.map((msg, i) => 
                i === messageIndex ? { ...msg, showTranslation: true } : msg
            );
            updateSession(currentSessionId, { messages: updatedMessages });
        }
    };



    // AI 自动补全单词信息
    const completeWordInfo = async (word: string, context: string) => {
        if (!apiKey) {
            toast("请先设置 API Key", "error");
            return null;
        }
        
        try {
            const response = await fetch('https://api.deepseek.com/chat/completions', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json', 
                    'Authorization': `Bearer ${apiKey}` 
                },
                body: JSON.stringify({
                    model: 'deepseek-chat',
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
                })
            });

            if (!response.ok) throw new Error("API 请求失败");
            
            const data = await response.json();
            const content = data.choices[0].message.content;
            return JSON.parse(content);
        } catch (e) {
            console.error('Word completion error:', e);
            toast("AI 补全失败，已存入基本信息", "error");
            return null;
        }
    };

    const translatePhrase = React.useCallback(async (text: string, context: string) => {
        if (!apiKey) return;

        try {
            const response = await fetch('https://api.deepseek.com/chat/completions', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json', 
                    'Authorization': `Bearer ${apiKey}` 
                },
                body: JSON.stringify({
                    model: 'deepseek-chat',
                    messages: [
                        { 
                            role: 'system', 
                            content: 'You are a professional translator. Translate the given English phrase briefly and accurately into Chinese based on its context. Return ONLY the translation text.' 
                        },
                        { 
                            role: 'user', 
                            content: `Phrase: "${text}"\nContext: "${context}"` 
                        }
                    ],
                    max_tokens: 50
                })
            });

            if (response.ok) {
                const data = await response.json();
                const translation = data.choices[0].message.content.trim();
                setSelectionBox(prev => ({ ...prev, translation, isLoading: false }));
            }
        } catch (error) {
            console.error('Translation error:', error);
            setSelectionBox(prev => ({ ...prev, translation: '翻译失败', isLoading: false }));
        }
    }, [apiKey]);

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
        
        setIsCompletingWord(false);
    };

    const chatAmbience = {
        vocabulary:
            'from-emerald-100/35 via-slate-50/90 to-cyan-50/40 dark:from-emerald-950/40 dark:via-slate-950 dark:to-cyan-950/35',
        casual:
            'from-amber-100/40 via-stone-50/95 to-orange-50/35 dark:from-amber-950/35 dark:via-stone-950 dark:to-orange-950/30',
        surprise:
            'from-violet-100/40 via-slate-50/90 to-indigo-100/35 dark:from-violet-950/40 dark:via-slate-950 dark:to-indigo-950/35',
    }[chatMode];

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
                        <button 
                            onClick={handleSaveSelection}
                            disabled={isCompletingWord}
                            className={cn(
                                "flex w-full items-center justify-center gap-1.5 border-t border-white/50 py-2.5 text-[10px] font-bold uppercase tracking-wider transition-colors dark:border-white/[0.08]",
                                isCompletingWord
                                    ? "cursor-not-allowed bg-slate-100/50 text-slate-300 dark:bg-slate-800/40 dark:text-slate-600"
                                    : "bg-white/40 text-slate-600 hover:bg-indigo-50/80 hover:text-indigo-700 dark:bg-white/[0.06] dark:text-slate-300 dark:hover:bg-indigo-500/15 dark:hover:text-indigo-300"
                            )}
                        >
                            {isCompletingWord ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BookOpen className="h-3.5 w-3.5" />}
                            {isCompletingWord ? '保存中…' : '加入生词本'}
                        </button>
                    </div>
                </div>
            )}

            <div className="relative flex h-[calc(100dvh-5.5rem)] w-full min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-slate-100/50 shadow-[0_24px_80px_-24px_rgba(15,23,42,0.18)] ring-1 ring-white/60 dark:border-slate-700/50 dark:bg-slate-950/80 dark:shadow-[0_28px_90px_-20px_rgba(0,0,0,0.75),0_0_0_1px_rgba(255,255,255,0.04)_inset] dark:ring-white/[0.06] md:h-[calc(100vh-8rem)] md:rounded-3xl">
                <div
                    className="pointer-events-none absolute inset-0 rounded-3xl opacity-[0.55] dark:hidden"
                    style={{
                        background:
                            'radial-gradient(900px 420px at 12% -10%, rgba(99,102,241,0.12), transparent 55%), radial-gradient(700px 380px at 88% 0%, rgba(16,185,129,0.08), transparent 50%), radial-gradient(600px 400px at 50% 110%, rgba(139,92,246,0.07), transparent 45%)',
                    }}
                />
                <div
                    className="pointer-events-none absolute inset-0 hidden rounded-3xl opacity-[0.5] dark:block"
                    style={{
                        background:
                            'radial-gradient(880px 400px at 10% -8%, rgba(129,140,248,0.28), transparent 58%), radial-gradient(720px 360px at 92% 4%, rgba(45,212,191,0.14), transparent 52%), radial-gradient(640px 420px at 48% 108%, rgba(167,139,250,0.2), transparent 48%), linear-gradient(180deg, rgba(15,23,42,0.25) 0%, transparent 38%, rgba(15,23,42,0.35) 100%)',
                    }}
                />

                {/* 模式切换：分段控件 + 玻璃 */}
                <div className="relative z-10 shrink-0 border-b border-white/40 bg-white/45 px-2 py-2 backdrop-blur-xl backdrop-saturate-150 sm:px-3 sm:py-3 md:px-5 dark:border-white/[0.07] dark:bg-slate-900/50 dark:shadow-[inset_0_-1px_0_0_rgba(255,255,255,0.05)]">
                    <div className="grid w-full grid-cols-3 gap-1 rounded-2xl border border-white/60 bg-slate-900/[0.03] p-1 shadow-inner shadow-slate-900/5 dark:border-white/[0.09] dark:bg-slate-950/40 dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.45)] md:flex md:w-auto md:flex-row md:flex-wrap">
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
                                            ? 'bg-white text-slate-900 shadow-md shadow-slate-900/10 ring-1 ring-slate-200/80 dark:bg-slate-800/90 dark:text-slate-50 dark:shadow-[0_8px_28px_-6px_rgba(0,0,0,0.65),inset_0_1px_0_0_rgba(255,255,255,0.09)] dark:ring-white/12'
                                            : 'text-slate-500 hover:bg-white/50 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-white/[0.06] dark:hover:text-slate-200'
                                    )}
                                >
                                    <span
                                        className={cn(
                                            'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors',
                                            active
                                                ? 'bg-indigo-500/10 text-indigo-600 dark:bg-indigo-400/15 dark:text-indigo-300'
                                                : 'bg-slate-200/40 text-slate-400 dark:bg-slate-700/50 dark:text-slate-500'
                                        )}
                                    >
                                        <Icon className="h-4 w-4" />
                                    </span>
                                    <span className="flex flex-col leading-tight">
                                        <span
                                            className={cn(
                                                'text-xs font-bold tracking-tight',
                                                active ? 'text-slate-900 dark:text-slate-50' : 'text-slate-600 dark:text-slate-400'
                                            )}
                                        >
                                            {tab.label}
                                        </span>
                                        <span className="hidden text-[10px] font-medium text-slate-400 sm:block dark:text-slate-500">{tab.sub}</span>
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                    <p className="mt-2 line-clamp-2 max-w-3xl text-[10px] font-medium leading-relaxed text-slate-500 sm:mt-2.5 sm:line-clamp-none sm:text-[11px] dark:text-slate-400">
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
                        {sessions.sort((a, b) => b.updatedAt - a.updatedAt).map(session => (
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

                {/* 右侧：沉浸式对话舱（移动端全宽） */}
                <div
                    className="relative flex min-h-0 min-w-0 flex-1 flex-col"
                    onMouseUp={handleTextSelectGestureEnd}
                    onTouchEnd={handleTextSelectGestureEnd}
                >
                    {currentSession ? (
                        <>
                            <div className="flex items-center justify-between gap-2 border-b border-white/50 bg-white/35 px-3 py-3 backdrop-blur-xl backdrop-saturate-150 sm:px-5 sm:py-3.5 dark:border-white/[0.07] dark:bg-slate-900/45 dark:shadow-[inset_0_-1px_0_0_rgba(255,255,255,0.04)]">
                                <div className="flex min-w-0 items-center gap-2 sm:gap-3.5">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="h-9 shrink-0 gap-1 border-slate-200/80 bg-white/60 px-2 text-xs text-slate-700 shadow-sm md:hidden dark:border-white/15 dark:bg-slate-800/60 dark:text-slate-200"
                                        onClick={() => setSessionDrawerOpen(true)}
                                    >
                                        <Menu className="h-4 w-4" />
                                        对话
                                    </Button>
                                    <div className="relative shrink-0">
                                        <span className="absolute -bottom-0.5 -right-0.5 z-20 h-3 w-3 rounded-full border-2 border-white bg-emerald-500 shadow-sm dark:border-slate-900" />
                                        <Avatar className="relative z-10 h-10 w-10 border-2 border-white shadow-lg shadow-indigo-500/15 ring-2 ring-indigo-100/80 sm:h-11 sm:w-11 dark:border-slate-700 dark:ring-indigo-500/30">
                                            <AvatarImage src={emmaAvatar} className="object-cover" />
                                            <AvatarFallback className="bg-indigo-600 text-[10px] text-white sm:text-xs">EM</AvatarFallback>
                                        </Avatar>
                                    </div>
                                    <div className="min-w-0">
                                        <h2 className="truncate text-sm font-bold tracking-tight text-slate-900 dark:text-slate-50">Emma</h2>
                                        <div className="mt-0.5 flex items-center gap-2">
                                            <span className={cn('h-1.5 w-1.5 rounded-full', (isLoading || isOpening) ? 'animate-pulse bg-amber-400' : 'bg-emerald-400')} />
                                            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
                                                {(isLoading || isOpening) ? 'Composing' : 'Live'}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div
                                className={cn(
                                    'relative flex-1 space-y-6 overflow-y-auto bg-gradient-to-b px-3 py-6 sm:space-y-8 sm:px-4 sm:py-8 md:px-8',
                                    chatAmbience
                                )}
                            >
                                <div
                                    className="pointer-events-none absolute inset-0 opacity-40 dark:opacity-[0.22]"
                                    style={{
                                        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E")`,
                                    }}
                                />

                                <div className="relative mx-auto max-w-2xl space-y-6 sm:space-y-8">
                                {isOpening && currentSession.messages.length === 0 && (
                                    <div className="flex items-end gap-3">
                                        <Avatar className="h-10 w-10 shrink-0 border-2 border-white shadow-md dark:border-slate-700">
                                            <AvatarImage src={emmaAvatar} />
                                            <AvatarFallback>EM</AvatarFallback>
                                        </Avatar>
                                        <div className="flex items-center gap-3 rounded-3xl rounded-bl-md border border-white/70 bg-white/75 px-5 py-3.5 shadow-lg shadow-slate-900/5 backdrop-blur-md dark:border-white/[0.1] dark:bg-slate-800/55 dark:shadow-[0_12px_40px_-12px_rgba(0,0,0,0.5),inset_0_1px_0_0_rgba(255,255,255,0.07)] dark:backdrop-blur-xl">
                                            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-indigo-500 dark:text-indigo-400" />
                                            <span className="text-sm font-medium text-slate-600 dark:text-slate-300">Emma 正在根据当前模式向你搭话…</span>
                                        </div>
                                    </div>
                                )}
                                {currentSession.messages.map((msg, index) => (
                                    <div key={index} className={cn('flex gap-3', msg.role === 'user' ? 'flex-row-reverse' : 'flex-row')}>
                                        <Avatar className={cn('mt-0.5 shrink-0 border-2 border-white shadow-md dark:border-slate-700', msg.role === 'assistant' ? 'h-10 w-10' : 'h-9 w-9')}>
                                            {msg.role === 'assistant' ? (
                                                <><AvatarImage src={emmaAvatar} /><AvatarFallback className="bg-indigo-600 text-[10px] text-white">EM</AvatarFallback></>
                                            ) : (
                                                <AvatarFallback className="bg-slate-700 text-[10px] text-white">ME</AvatarFallback>
                                            )}
                                        </Avatar>
                                        <div className={cn('flex min-w-0 max-w-[min(100%,34rem)] flex-col gap-2', msg.role === 'user' ? 'items-end' : 'items-start')}>
                                            <div
                                                className={cn(
                                                    'message-content relative cursor-text select-text rounded-3xl px-5 py-3.5 text-[15px] leading-relaxed shadow-lg transition-shadow',
                                                    msg.role === 'user'
                                                        ? 'rounded-br-md bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-indigo-500/20'
                                                        : 'group rounded-bl-md border border-white/80 bg-white/80 text-slate-800 shadow-slate-900/5 backdrop-blur-md backdrop-saturate-150 dark:border-white/[0.1] dark:bg-slate-800/65 dark:text-slate-100 dark:shadow-[0_14px_40px_-14px_rgba(0,0,0,0.55),inset_0_1px_0_0_rgba(255,255,255,0.08)] dark:backdrop-blur-xl dark:backdrop-saturate-150'
                                                )}
                                            >
                                                {msg.correction && (
                                                    <div className="mb-3 rounded-xl border border-red-200/80 bg-red-50/95 p-3 text-xs text-red-900 dark:border-red-500/25 dark:bg-red-950/45 dark:text-red-100">
                                                        <p className="mb-1 font-bold">【纠错】</p>
                                                        <p className="leading-relaxed">{msg.correction}</p>
                                                    </div>
                                                )}
                                                <p className="whitespace-pre-wrap">{msg.content}</p>
                                            </div>
                                            {msg.role === 'assistant' && (
                                                <div className="flex flex-col items-start gap-2 pl-1">
                                                    <button 
                                                        type="button"
                                                        onClick={() => toggleTranslation(index)} 
                                                        className="flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-semibold text-indigo-600 transition hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-500/15"
                                                    >
                                                        <Languages className="h-3.5 w-3.5" />
                                                        {msg.showTranslation ? '隐藏翻译' : '查看翻译'}
                                                    </button>
                                                    {msg.showTranslation && (
                                                        <div className="max-w-full rounded-2xl border border-indigo-100/80 bg-indigo-50/60 px-4 py-3 text-sm italic leading-relaxed text-indigo-950/90 shadow-inner animate-in fade-in slide-in-from-top-1 duration-300 dark:border-indigo-400/20 dark:bg-indigo-950/40 dark:text-indigo-100 dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]">
                                                            {msg.isTranslating ? (
                                                                <div className="flex items-center gap-2 not-italic">
                                                                    <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-400" />
                                                                    <span className="text-xs text-slate-500 dark:text-slate-400">Emma 正在翻译中…</span>
                                                                </div>
                                                            ) : (
                                                                msg.translation || 'Emma 暂时无法翻译这段话。'
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                                {isLoading && (
                                    <div className="flex items-end gap-3">
                                        <Avatar className="h-10 w-10 border-2 border-white shadow-md dark:border-slate-700">
                                            <AvatarImage src={emmaAvatar} />
                                            <AvatarFallback>EM</AvatarFallback>
                                        </Avatar>
                                        <div className="flex items-center gap-3 rounded-3xl rounded-bl-md border border-white/70 bg-white/75 px-5 py-3.5 shadow-md backdrop-blur-md dark:border-white/[0.1] dark:bg-slate-800/50 dark:shadow-[0_10px_36px_-10px_rgba(0,0,0,0.5),inset_0_1px_0_0_rgba(255,255,255,0.06)] dark:backdrop-blur-xl">
                                            <Loader2 className="h-4 w-4 animate-spin text-indigo-500 dark:text-indigo-400" />
                                            <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Emma is thinking…</span>
                                        </div>
                                    </div>
                                )}
                                <div ref={messagesEndRef} />
                                </div>
                            </div>

                            <div className="relative border-t border-white/50 bg-gradient-to-t from-white/90 via-white/70 to-transparent p-3 pb-4 backdrop-blur-xl backdrop-saturate-150 sm:p-4 sm:pb-5 dark:border-white/[0.08] dark:from-slate-950/92 dark:via-slate-950/55 dark:to-transparent dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]">
                                <div className="mx-auto flex max-w-2xl flex-col gap-2 sm:flex-row sm:items-end sm:gap-3">
                                    <div className="relative min-h-[52px] flex-1 overflow-hidden rounded-2xl border border-white/70 bg-white/85 shadow-inner shadow-slate-900/5 backdrop-blur-md dark:border-white/[0.12] dark:bg-slate-900/70 dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.45),inset_0_0_0_1px_rgba(255,255,255,0.05)] dark:backdrop-blur-xl">
                                        <textarea
                                            value={input}
                                            onChange={(e) => setInput(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' && !e.shiftKey) {
                                                    e.preventDefault();
                                                    handleSend();
                                                }
                                            }}
                                            placeholder="用英语回复 Emma…"
                                            disabled={isLoading || isOpening || (!!currentSession?.openingPending && currentSession.messages.length === 0)}
                                            className="max-h-36 min-h-[52px] w-full resize-none bg-transparent px-3 py-3 pr-11 text-[15px] leading-relaxed text-slate-800 placeholder:text-slate-400 focus:outline-none disabled:cursor-not-allowed disabled:opacity-45 sm:px-4 sm:py-3.5 sm:pr-12 dark:text-slate-100 dark:placeholder:text-slate-500"
                                            rows={1}
                                        />
                                        <Button variant="ghost" size="icon" className="absolute bottom-2 right-2 h-9 w-9 rounded-xl text-slate-400 hover:bg-slate-100 hover:text-indigo-600 dark:hover:bg-slate-800 dark:hover:text-indigo-400">
                                            <Mic className="h-4 w-4" />
                                        </Button>
                                    </div>
                                    <Button
                                        onClick={handleSend}
                                        disabled={isLoading || isOpening || !input.trim() || (!!currentSession?.openingPending && currentSession.messages.length === 0)}
                                        className="h-11 w-full shrink-0 rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 px-5 shadow-lg shadow-indigo-500/30 transition hover:from-indigo-500 hover:to-violet-500 disabled:from-slate-200 disabled:to-slate-200 disabled:text-slate-400 disabled:shadow-none sm:h-[52px] sm:w-auto dark:shadow-indigo-900/50 dark:disabled:from-slate-800 dark:disabled:to-slate-800 dark:disabled:text-slate-600"
                                    >
                                        <Send className="h-5 w-5" />
                                    </Button>
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="relative flex h-full flex-col items-center justify-center overflow-hidden bg-gradient-to-b from-slate-50 to-indigo-50/30 px-6 text-center dark:from-slate-950 dark:to-indigo-950/40">
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
            </div>
        </>
    );
}
