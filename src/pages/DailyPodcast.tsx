import * as React from 'react';
import { Play, Pause, RotateCcw, SkipForward, Loader2, Mic2, Mic, Headphones, Sparkles, Settings as SettingsIcon, AlertCircle, Quote, X, Check, Languages, Trash2, BookOpen, Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import { FavoriteStarBurstButton } from '@/components/ui/favorite-burst-button';
import { useLocalStorage } from "@/hooks/use-local-storage";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import {
    splitIntoSentences,
    buildResultFromTranscript,
    assessPronunciationFromApi,
    startSpeechHoldSession,
    isSpeechRecognitionSupported,
    getPronunciationApiUrl,
    type PronunciationResult,
} from "@/lib/pronunciation-assessment";
import { Progress } from "@/components/ui/progress";

import { useWordBankStore } from "@/store/wordBankStore";
import { recordReadingSession } from "@/store/learningAnalyticsStore";
import { useDailyLoopStore, syncDailyLoopDate } from "@/store/dailyLoopStore";

interface DailyPodcastProps {
    onNavigateToSettings?: () => void;
}

type PodcastSessionConfig = {
    theme: string;
    tone: string;
    difficulty: string;
};

type PodcastSession = {
    id: string;
    englishText: string;
    chineseText: string;
    targetWords: string[];
    masteredWords: string[];
    hasPlayed: boolean;
    config: PodcastSessionConfig;
    timestamp: number;
};

type SavedPodcast = {
    id: string;
    englishText: string;
    chineseText: string;
    targetWords: string[];
    timestamp: number;
};

export function DailyPodcastPage({ onNavigateToSettings }: DailyPodcastProps) {
    const { addWord, words, getWordsForPodcast, updateWordProgress } = useWordBankStore();
    const markReadingDone = useDailyLoopStore((s) => s.markReadingDone);
    const [apiKey] = useLocalStorage('podcast_api_key', '');
    const [savedPodcasts, setSavedPodcasts] = useLocalStorage<SavedPodcast[]>('saved_podcasts', []);
    const [currentPodcastSession, setCurrentPodcastSession] = useLocalStorage<PodcastSession | null>('currentPodcastSession', null);
    
    const { toast } = useToast();

    React.useEffect(() => {
        syncDailyLoopDate();
    }, []);

    const [story, setStory] = React.useState("");
    const [chineseTranslation, setChineseTranslation] = React.useState("");
    const [showTranslation, setShowTranslation] = React.useState(false);
    const [targetWords, setTargetWords] = React.useState<string[]>([]);
    const [isLoading, setIsLoading] = React.useState(false);
    const [isPlaying, setIsPlaying] = React.useState(false);
    const [currentCharIndex, setCurrentCharIndex] = React.useState<number | null>(null);
    /** 单击/双击加入生词本后的短暂高亮，便于在手机端看清选的是哪个词 */
    const [wordTapFlashIdx, setWordTapFlashIdx] = React.useState<number | null>(null);
    const [isModalOpen, setIsModalOpen] = React.useState(false);
    const [isDiaryOpen, setIsDiaryOpen] = React.useState(false);
    const [currentSessionId, setCurrentSessionId] = React.useState<string | null>(null);
    
    // 学习闭环状态
    const [masteredWords, setMasteredWords] = React.useState<string[]>([]);
    const [hasPlayed, setHasPlayed] = React.useState(false);

    // 影子跟读 / 发音教练
    const [shadowSentenceIndex, setShadowSentenceIndex] = React.useState(0);
    const [shadowResult, setShadowResult] = React.useState<PronunciationResult | null>(null);
    const [shadowRecording, setShadowRecording] = React.useState(false);
    const [shadowProcessing, setShadowProcessing] = React.useState(false);
    const speechHoldRef = React.useRef<ReturnType<typeof startSpeechHoldSession> | null>(null);
    const mediaRecorderRef = React.useRef<MediaRecorder | null>(null);
    const mediaChunksRef = React.useRef<Blob[]>([]);
    const mediaStreamRef = React.useRef<MediaStream | null>(null);
    const shadowSessionActiveRef = React.useRef(false);
    
    // 自定义选项状态
    const [selectedTheme, setSelectedTheme] = React.useState('Daily Life');
    const [selectedTone, setSelectedTone] = React.useState('Humorous');
    const [selectedDifficulty, setSelectedDifficulty] = React.useState('Intermediate');

    const themes = [
        { id: 'Daily Life', label: '日常生活', emoji: '☕' },
        { id: 'Workplace', label: '职场吐槽', emoji: '💼' },
        { id: 'Sci-Fi', label: '科幻脑洞', emoji: '🛸' },
        { id: 'Thriller', label: '悬疑惊悚', emoji: '🕵️' },
        { id: 'Fantasy', label: '奇幻冒险', emoji: '🧝' },
        { id: 'Surprise Me', label: '随便来一个', emoji: '🎲' }
    ];

    const tones = [
        { id: 'Humorous', label: '幽默脱口秀', emoji: '🎙️' },
        { id: 'Healing/Cozy', label: '治愈深夜电台', emoji: '🌙' },
        { id: 'Motivational', label: '激情演讲', emoji: '🔥' }
    ];
    const difficultyOptions = [
        { 
            id: 'Beginner', 
            label: '初级 (Beginner)', 
            descriptor: 'Junior High School level (CEFR A2), very short sentences, basic vocabulary.' 
        },
        { 
            id: 'Intermediate', 
            label: '中级 (Intermediate)', 
            descriptor: 'High School level (CEFR B2), comfortable daily conversational English, moderate sentence structures.' 
        },
        { 
            id: 'Advanced', 
            label: '高级 (Advanced)', 
            descriptor: 'College/University level (CEFR C1-C2), sophisticated, native-level phrasing, advanced vocabulary, and complex sentence structures.' 
        }
    ];

    const PODCAST_USE_MOCK = false;

    const buildMockBilingual = (words: string[]) => {
        const list = words.slice(0, 4);
        const a = list[0] ?? 'adventure';
        const b = list[1] ?? 'solitude';
        const c = list[2] ?? 'vibrant';
        const d = list[3] ?? 'routine';

        return {
            english: `This morning I missed the bus, so I walked to work. On the way, I decided to take a small ${a}. I went into a quiet street for some ${b}. A small bakery had a ${c} window display, so I bought a warm bread roll. Later my friend texted me about a boring ${d}, and we laughed about it at lunch. It was a normal day, but it felt lighter.`,
            chinese: `今天早上我没赶上公交，于是走路去上班。路上我决定来一次小小的${a}：拐进一条安静的小街，享受一点${b}。一家小面包店的橱窗看起来很${c}，我就买了一个热面包卷。后来朋友发消息吐槽一个无聊的${d}，我们午饭时聊着聊着就笑了。就是普通的一天，但心情轻松了很多。`
        };
    };
    
    const synth = window.speechSynthesis;
    const utteranceRef = React.useRef<SpeechSynthesisUtterance | null>(null);
    const sessionTimestampRef = React.useRef<number>(Date.now());


    // 数据清洗与去重辅助函数
    const getCleanWords = React.useCallback((words: string[]) => {
        return Array.from(new Set(words.map(w => w.toLowerCase().trim()))).filter(w => w.length > 0);
    }, []);

    const normalizeWord = React.useCallback((value: string) => {
        return (value || '').toLowerCase().replace(/[^a-z]/g, '').trim();
    }, []);

    const isInWordBank = React.useCallback((value: string) => {
        const target = normalizeWord(value);
        if (!target) return false;
        return (Array.isArray(words) ? words : []).some(item => normalizeWord(item.word) === target);
    }, [words, normalizeWord]);

    const handleAddPodcastWord = React.useCallback((word: string) => {
        const clean = normalizeWord(word);
        if (!clean) return;
        if (isInWordBank(clean)) {
            toast(`"${clean}" 已在生词本中`, "default");
            return;
        }
        addWord({
            word: clean,
            type: 'word',
            context: story.substring(0, 220),
        });
        toast(`"${clean}" 已添加到生词本`, "success");
    }, [addWord, isInWordBank, normalizeWord, story, toast]);

    React.useEffect(() => {
        if (currentPodcastSession && currentPodcastSession.englishText) {
            sessionTimestampRef.current = currentPodcastSession.timestamp;
            setCurrentSessionId(currentPodcastSession.id);
            setStory(currentPodcastSession.englishText);
            setChineseTranslation(currentPodcastSession.chineseText);
            setTargetWords(currentPodcastSession.targetWords);
            setMasteredWords(currentPodcastSession.masteredWords);
            setHasPlayed(currentPodcastSession.hasPlayed);
            setSelectedTheme(currentPodcastSession.config.theme);
            setSelectedTone(currentPodcastSession.config.tone);
            setSelectedDifficulty(currentPodcastSession.config.difficulty);
            return;
        }

        const wordsToReview = getWordsForPodcast();
        const initialWords = wordsToReview.length > 0
            ? wordsToReview.map(w => w.word)
            : ['adventure', 'solitude', 'vibrant'];
        setTargetWords(initialWords);

        setCurrentSessionId(null);
        setStory("");
        setChineseTranslation("");
        setShowTranslation(false);
        setMasteredWords([]);
        setHasPlayed(false);
    }, [currentPodcastSession, getWordsForPodcast]);

    React.useEffect(() => {
        if (!story) return;
        const timestamp = sessionTimestampRef.current;
        const id = currentSessionId ?? `session-${timestamp}`;

        if (!currentSessionId) {
            setCurrentSessionId(id);
        }

        setCurrentPodcastSession({
            id,
            englishText: story,
            chineseText: chineseTranslation,
            targetWords,
            masteredWords,
            hasPlayed,
            config: {
                theme: selectedTheme,
                tone: selectedTone,
                difficulty: selectedDifficulty,
            },
            timestamp,
        });
    }, [
        story,
        chineseTranslation,
        targetWords,
        masteredWords,
        hasPlayed,
        selectedTheme,
        selectedTone,
        selectedDifficulty,
        currentSessionId,
        setCurrentPodcastSession,
    ]);

    const generateStory = async () => {
        if (!apiKey) {
            toast("Please configure DeepSeek API Key in Settings first.", "error");
            return;
        }

        setIsModalOpen(false); 
        setIsLoading(true);
        setShowTranslation(false);
        setChineseTranslation("");
        setCurrentPodcastSession(null);
        sessionTimestampRef.current = Date.now();
        setCurrentSessionId(`session-${sessionTimestampRef.current}`);
        stopAudio(); 
        setCurrentCharIndex(null);

        try {
            // 调用 Zustand store 抽取今天需要复习的词
            const wordsToReview = getWordsForPodcast();
            const wordsSource = wordsToReview.length > 0 
                ? wordsToReview.map(w => w.word) 
                : ['adventure', 'solitude', 'vibrant'];
            
            const cleanedWords = getCleanWords(wordsSource);
            setTargetWords(cleanedWords);
            const difficultyDescriptor = (difficultyOptions.find(o => o.id === selectedDifficulty)?.descriptor) || 'B2 level';

            if (PODCAST_USE_MOCK) {
                await new Promise(resolve => setTimeout(resolve, 450));
                const mock = buildMockBilingual(cleanedWords);
                const cleanEnglish = mock.english.replace(/[*_]/g, '').replace(/\*\*/g, '');
                const cleanChinese = mock.chinese.replace(/[*_]/g, '').replace(/\*\*/g, '');

                setMasteredWords([]);
                setHasPlayed(false);
                setStory(cleanEnglish);
                setChineseTranslation(cleanChinese);
                toast("Mock story loaded.", "success");
                return;
            }

            // 暂时禁用真实大模型请求：等 UI 全部确认完美后再接回
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
                            content: `You are an expert scriptwriter for a popular short podcast. Write a ~100-word engaging monologue.
Theme: ${selectedTheme}
Tone: ${selectedTone}
Target Words to Review: [${cleanedWords.join(', ')}]

Vocabulary Constraint: You MUST strictly write the story at the [${difficultyDescriptor}].
Rule A: The grammar structure should match this level.
Rule B: EXCEPT for the Target Words [${cleanedWords.join(', ')}], do NOT use any vocabulary that exceeds this level. Use simple, easily understandable words for the context so the user can easily guess the meaning of the Target Words.

CRITICAL RULE (Anti-Drama): Regardless of the difficulty level, you MUST describe realistic, grounded human situations. DO NOT use theatrical metaphors (e.g., do not call a fridge an 'abyss'). Advanced level means 'sophisticated native fluency', NOT '19th-century poetry'. Keep the plot strictly grounded in daily reality.

Rule 1: Build a highly logical and creative story based on the Theme. DO NOT write abstract philosophical nonsense.
Rule 2: You MUST seamlessly integrate ALL the Target Words into the plot.
Rule 3: Return your response in STRICT JSON format with two keys: "english" and "chinese". The "english" key contains the story. The "chinese" key contains a natural, conversational Chinese translation.
CRITICAL FORMATTING RULE: Do NOT use any Markdown formatting (like **asterisks** or _underscores_) in your response. Output pure, plain JSON only.` 
                        },
                        { 
                            role: 'user', 
                            content: 'Generate the story now.' 
                        }
                    ],
                    response_format: { type: 'json_object' },
                    temperature: 0.7
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error?.message || "DeepSeek API Request failed");
            }
            
            const data = await response.json();
            const parsedContent = JSON.parse(data.choices[0].message.content.trim());
            const rawEnglish = parsedContent.english || '';
            const rawChinese = parsedContent.chinese || '';
            
            // 数据清洗：移除可能破坏渲染的 Markdown 标记（如星号和下划线）
            const cleanContent = rawEnglish.replace(/[*_]/g, '').replace(/\*\*/g, '');
            const cleanChinese = rawChinese.replace(/[*_]/g, '').replace(/\*\*/g, '');
            
            // 清空旧的学习状态
            setMasteredWords([]);
            setHasPlayed(false);
            
            setStory(cleanContent);
            setChineseTranslation(cleanChinese);
            toast("Emma has prepared a new story for you!", "success");
        } catch (error: any) {
            console.error(error);
            toast(error.message || "API connection failed. Please check your network or Key.", "error");
        } finally {
            setIsLoading(false);
        }
    };

    const togglePlay = () => {
        if (isPlaying) {
            pauseAudio();
        } else {
            playAudio();
        }
    };

    const playAudio = () => {
        if (synth.paused && utteranceRef.current) {
            synth.resume();
            setIsPlaying(true);
            setHasPlayed(true);
            return;
        }

        stopAudio();
        
        const utterance = new SpeechSynthesisUtterance(story);
        utterance.lang = 'en-US';
        
        const voices = synth.getVoices();
        const voice = voices.find(v => v.lang === 'en-US' && (v.name.includes('Google') || v.name.includes('Samantha') || v.name.includes('Microsoft'))) || voices.find(v => v.lang.startsWith('en'));
        if (voice) utterance.voice = voice;

        utterance.onstart = () => {
            setIsPlaying(true);
            setHasPlayed(true);
        };
        utterance.onend = () => {
            setIsPlaying(false);
            setCurrentCharIndex(null);
        };
        utterance.onerror = () => {
            setIsPlaying(false);
            setCurrentCharIndex(null);
        };
        
        // 绑定 onboundary 事件实现逐词追踪
        utterance.onboundary = (event) => {
            if (event.name === 'word') {
                setCurrentCharIndex(event.charIndex);
            }
        };
        
        utteranceRef.current = utterance;
        synth.speak(utterance);
    };

    const pauseAudio = () => {
        synth.pause();
        setIsPlaying(false);
    };

    const stopAudio = () => {
        synth.cancel();
        setIsPlaying(false);
        setCurrentCharIndex(null);
    };

    const shadowSentences = React.useMemo(() => splitIntoSentences(story), [story]);
    const shadowRefText = shadowSentences[shadowSentenceIndex] ?? "";

    React.useEffect(() => {
        setShadowSentenceIndex(0);
        setShadowResult(null);
    }, [story]);

    React.useEffect(() => {
        if (shadowSentences.length === 0) return;
        setShadowSentenceIndex((i) => Math.min(i, Math.max(0, shadowSentences.length - 1)));
    }, [shadowSentences.length]);

    const cleanupMedia = () => {
        mediaRecorderRef.current = null;
        mediaChunksRef.current = [];
        if (mediaStreamRef.current) {
            mediaStreamRef.current.getTracks().forEach((t) => t.stop());
            mediaStreamRef.current = null;
        }
    };

    const endShadowSession = React.useCallback(async () => {
        if (!shadowSessionActiveRef.current) return;

        const refText = shadowRefText;
        const useApi = Boolean(getPronunciationApiUrl());

        shadowSessionActiveRef.current = false;
        setShadowRecording(false);

        if (!refText.trim()) {
            cleanupMedia();
            return;
        }

        // 用户松手太快，麦克风尚未就绪：仅清理
        if (useApi && !mediaRecorderRef.current) {
            cleanupMedia();
            return;
        }

        setShadowProcessing(true);
        try {
            if (useApi && mediaRecorderRef.current) {
                const mr = mediaRecorderRef.current;
                const blob = await new Promise<Blob>((resolve, reject) => {
                    mr.onerror = () => reject(new Error('录音失败'));
                    mr.onstop = () => {
                        const chunks = mediaChunksRef.current;
                        resolve(new Blob(chunks, { type: chunks[0]?.type || 'audio/webm' }));
                    };
                    try {
                        mr.stop();
                    } catch {
                        reject(new Error('结束录音失败'));
                    }
                });
                cleanupMedia();
                const res = await assessPronunciationFromApi(blob, refText);
                setShadowResult(res);
                toast('发音评估完成', 'success');
            } else {
                const session = speechHoldRef.current;
                speechHoldRef.current = null;
                const transcript = session ? await session.stop() : '';
                cleanupMedia();
                const res = buildResultFromTranscript(refText, transcript);
                setShadowResult(res);
                if (!transcript.trim()) {
                    toast('未识别到语音，请靠近麦克风重试（浏览器需允许麦克风）', 'error');
                } else {
                    toast('已生成参考评分（接入 VITE_PRONUNCIATION_API_URL 可获得更专业的发音模型）', 'success');
                }
            }
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : '评估失败';
            toast(msg, 'error');
        } finally {
            cleanupMedia();
            setShadowProcessing(false);
        }
    }, [shadowRefText, toast]);

    const beginShadowSession = React.useCallback(async () => {
        if (!shadowRefText.trim() || isLoading || shadowProcessing || shadowSessionActiveRef.current) return;

        setShadowResult(null);
        shadowSessionActiveRef.current = true;
        setShadowRecording(true);

        const useApi = Boolean(getPronunciationApiUrl());

        try {
            if (useApi) {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                mediaStreamRef.current = stream;
                mediaChunksRef.current = [];
                const mr = new MediaRecorder(stream);
                mediaRecorderRef.current = mr;
                mr.ondataavailable = (ev) => {
                    if (ev.data.size) mediaChunksRef.current.push(ev.data);
                };
                mr.start(120);
            } else {
                if (!isSpeechRecognitionSupported()) {
                    shadowSessionActiveRef.current = false;
                    setShadowRecording(false);
                    toast('当前浏览器不支持语音识别。请使用 Chrome / Edge，或配置后端发音评估 API。', 'error');
                    return;
                }
                const session = startSpeechHoldSession();
                speechHoldRef.current = session;
                session.start();
            }
        } catch (e: unknown) {
            shadowSessionActiveRef.current = false;
            setShadowRecording(false);
            const msg = e instanceof Error ? e.message : '无法访问麦克风';
            toast(msg, 'error');
            cleanupMedia();
        }
    }, [shadowRefText, isLoading, shadowProcessing, toast]);

    // 完成本次复习逻辑
    const handleCompleteSession = () => {
        recordReadingSession();
        markReadingDone();
        if (masteredWords.length > 0) {
            // 根据 targetWords 和 masteredWords 找到对应的 word ID
            const wordsToReview = getWordsForPodcast();
            const masteredIds = wordsToReview
                .filter(w => masteredWords.includes(w.word))
                .map(w => w.id);
            
            if (masteredIds.length > 0) {
                updateWordProgress(masteredIds);
            }
        }
        
        toast(`太棒了！本次复习了 ${masteredWords.length} 个单词 ✨`, "success");
        
        // 重置状态准备下一次
        stopAudio();
        setStory("");
        setChineseTranslation("");
        setShowTranslation(false);
        setMasteredWords([]);
        setHasPlayed(false);
        setCurrentSessionId(null);
        setCurrentPodcastSession(null);
    };

    // 收藏至日记
    const handleSavePodcast = () => {
        if (!story) return;
        const id = currentSessionId ?? `podcast-${Date.now()}`;
        if (savedPodcasts.some(p => p.id === id)) {
            toast("已在播客日记中", "default");
            return;
        }
        const newPodcast: SavedPodcast = {
            id,
            englishText: story,
            chineseText: chineseTranslation,
            targetWords,
            timestamp: Date.now()
        };
        setSavedPodcasts([newPodcast, ...savedPodcasts]);
        toast("已收藏至播客日记 ✨", "success");
    };

    const isCurrentSaved = Boolean(currentSessionId && savedPodcasts.some(p => p.id === currentSessionId));

    const formatTimestamp = (ts: number) => {
        try {
            return new Date(ts).toLocaleString();
        } catch {
            return '';
        }
    };

    const renderHighlightedEnglish = (text: string, wordsToHighlight: string[]) => {
        const pieces = text.split(/(\s+)/);
        return pieces.map((piece, idx) => {
            const normalized = piece.toLowerCase().replace(/[^a-z]/g, '');
            const isTarget = wordsToHighlight.some(tw => normalized === tw.toLowerCase());
            return (
                <span
                    key={idx}
                    className={cn(
                        'inline-block px-0.5 rounded-sm',
                        isTarget ? 'font-bold text-amber-600' : 'text-stone-700'
                    )}
                >
                    {piece}
                </span>
            );
        });
    };

    // 逐词渲染逻辑
    const renderWordTrackingStory = () => {
        if (isLoading) {
            return (
                <div className="flex flex-col gap-3 py-4">
                    <div className="h-6 bg-stone-200 rounded-md animate-pulse w-full" />
                    <div className="h-6 bg-stone-200 rounded-md animate-pulse w-5/6" />
                    <div className="h-6 bg-stone-200 rounded-md animate-pulse w-4/6" />
                </div>
            );
        }

        // 将文本按空格分割，并记录每个单词在原字符串中的起始位置
        const words = story.split(/(\s+)/); // 保留空格
        let runningCharIndex = 0;

        return words.map((word, idx) => {
            const start = runningCharIndex;
            const end = start + word.length;
            runningCharIndex = end;

            const cleanToken = normalizeWord(word);
            const isToken = cleanToken.length > 0;

            // 检查该词是否为目标词
            const isTarget = targetWords.some(tw => 
                word.toLowerCase().replace(/[^a-z]/g, '') === tw.toLowerCase()
            );

            // 检查当前是否正在读这个词 (Karaoke 高亮)
            const isHighlighted = currentCharIndex !== null && 
                                 currentCharIndex >= start && 
                                 currentCharIndex < end && 
                                 word.trim().length > 0;

            const flashTap = wordTapFlashIdx === idx && !isHighlighted;

            /** 仅清除系统选区，减轻双击收录后的灰条/选中残留；不改布局、不用 preventDefault，避免影响换行与正文显示 */
            const clearNativeSelectionSoon = () => {
                window.requestAnimationFrame(() => window.getSelection()?.removeAllRanges());
            };

            return (
                <span
                    key={idx}
                    onClick={() => {
                        if (isTarget) {
                            handleAddPodcastWord(word);
                            setWordTapFlashIdx(idx);
                            clearNativeSelectionSoon();
                            window.setTimeout(() => {
                                setWordTapFlashIdx((cur) => (cur === idx ? null : cur));
                            }, 700);
                        }
                    }}
                    onDoubleClick={() => {
                        if (isToken) {
                            handleAddPodcastWord(word);
                            setWordTapFlashIdx(idx);
                            clearNativeSelectionSoon();
                            window.setTimeout(() => {
                                setWordTapFlashIdx((cur) => (cur === idx ? null : cur));
                            }, 700);
                        }
                    }}
                    title={
                        isTarget
                            ? '点击添加到生词本'
                            : isToken
                              ? '双击添加到生词本'
                              : undefined
                    }
                    className={cn(
                        'inline-block rounded-md px-0.5 py-0.5 transition-all duration-200',
                        isTarget ? 'cursor-pointer hover:bg-amber-100/80 hover:ring-1 hover:ring-amber-400/70' : '',
                        !isTarget && isToken ? 'cursor-pointer hover:bg-stone-200/90 active:bg-amber-200' : '',
                        isHighlighted &&
                            'relative z-[1] bg-amber-400 text-stone-900 shadow-md ring-2 ring-amber-600 font-semibold',
                        flashTap && 'bg-emerald-300 text-emerald-950 ring-2 ring-emerald-600 font-semibold shadow-md',
                        isTarget && !isHighlighted && 'font-bold text-amber-600',
                        !isTarget && !isHighlighted && 'text-stone-700'
                    )}
                >
                    {word}
                </span>
            );
        });
    };

    if (!apiKey) {
        return (
            <div className="relative flex min-h-[calc(100dvh-5.5rem)] flex-col items-center justify-center overflow-hidden rounded-2xl bg-stone-50 px-4 py-8 text-stone-800 md:min-h-[calc(100vh-8rem)] md:rounded-3xl md:p-8">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-red-500/5 blur-[120px] rounded-full pointer-events-none" />
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="z-10 flex flex-col items-center text-center space-y-6 max-w-md">
                    <div className="p-4 bg-red-50 rounded-full border border-red-100"><AlertCircle className="h-12 w-12 text-red-500" /></div>
                    <div className="space-y-2">
                        <h2 className="text-2xl font-bold text-stone-900">AI Podcast Inactive</h2>
                        <p className="text-stone-500 font-medium">请先前往设置页面，为每日播客模块配置专属的 API Key。</p>
                    </div>
                    <Button onClick={() => onNavigateToSettings?.()} className="bg-stone-900 text-stone-50 hover:bg-stone-800 px-8 py-6 rounded-2xl text-lg font-bold gap-2 transition-all hover:scale-105">
                        <SettingsIcon className="h-5 w-5" /> Go to Settings
                    </Button>
                </motion.div>
            </div>
        );
    }

    return (
        <div className="relative flex min-h-[calc(100dvh-5.5rem)] flex-col items-center justify-center overflow-hidden rounded-2xl bg-stone-50 px-3 pb-[max(1.25rem,env(safe-area-inset-bottom,0px))] pt-4 font-sans text-stone-700 md:min-h-[calc(100vh-8rem)] md:rounded-3xl md:p-12 md:pb-12 md:pt-6">
            {/* Soft Ambient Background */}
            <div className="pointer-events-none absolute top-0 left-1/4 h-[400px] w-[400px] rounded-full bg-amber-500/5 blur-[100px]" />

            <div className="z-10 w-full max-w-3xl space-y-5 sm:space-y-8 md:px-0">
                {/* Header：移动端标题与按钮分行，避免横向挤爆 */}
                <div className="flex flex-col gap-4 px-0 sm:px-2 md:flex-row md:items-center md:justify-between md:gap-6">
                    <div className="flex min-w-0 items-center gap-3">
                        <div className="shrink-0 rounded-2xl border border-stone-100 bg-white p-2 shadow-sm sm:p-2.5">
                            <Mic2 className="h-5 w-5 text-amber-600" />
                        </div>
                        <div className="min-w-0">
                            <h2 className="text-[15px] font-bold tracking-tight text-stone-900 sm:text-base">
                                Daily Context Pod
                            </h2>
                            <p className="text-[10px] font-semibold uppercase tracking-widest text-stone-400 sm:text-[11px]">
                                Emma AI · Cozy Paper
                            </p>
                        </div>
                    </div>
                    <div className="grid w-full grid-cols-3 gap-2 md:flex md:w-auto md:flex-nowrap md:items-center md:gap-3">
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-10 gap-1 rounded-xl border border-stone-200/50 bg-white px-2 text-[11px] text-stone-600 shadow-sm transition-all hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700 sm:gap-2 sm:px-4 sm:text-xs"
                            onClick={() => setIsDiaryOpen(true)}
                            disabled={isLoading}
                        >
                            <BookOpen className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate sm:hidden">收藏</span>
                            <span className="hidden sm:inline">我的收藏</span>
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            className={cn(
                                'h-10 gap-1 rounded-xl border px-2 text-[11px] shadow-sm transition-all sm:gap-2 sm:px-4 sm:text-xs',
                                showTranslation
                                    ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
                                    : 'border-stone-200/50 bg-white text-stone-600 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700'
                            )}
                            onClick={() => setShowTranslation(!showTranslation)}
                            disabled={isLoading || !story}
                        >
                            <Languages className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate sm:hidden">{showTranslation ? '译文' : '对照'}</span>
                            <span className="hidden sm:inline">{showTranslation ? '隐藏翻译' : '中英对照'}</span>
                        </Button>

                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-10 gap-1 rounded-xl border border-stone-200/50 bg-white px-2 text-[11px] text-stone-600 shadow-sm transition-all hover:border-amber-200 hover:bg-amber-50 hover:text-amber-700 sm:gap-2 sm:px-4 sm:text-xs"
                            onClick={() => setIsModalOpen(true)}
                            disabled={isLoading}
                        >
                            {isLoading ? (
                                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                            ) : (
                                <SettingsIcon className="h-3.5 w-3.5 shrink-0" />
                            )}
                            <span className="truncate sm:hidden">{isLoading ? '…' : '定制'}</span>
                            <span className="hidden sm:inline">{isLoading ? 'Writing…' : 'Customize'}</span>
                        </Button>
                    </div>
                </div>

                {/* Podcast Diary Modal */}
                <AnimatePresence>
                    {isDiaryOpen && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                onClick={() => setIsDiaryOpen(false)}
                                className="absolute inset-0 bg-stone-900/20 backdrop-blur-md"
                            />
                            <motion.div
                                initial={{ opacity: 0, scale: 0.98, y: 10 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.98, y: 10 }}
                                className="bg-white rounded-[2rem] shadow-2xl w-full max-w-2xl overflow-hidden z-10 relative border border-stone-100"
                            >
                                <div className="p-8 space-y-6">
                                    <div className="flex items-start justify-between">
                                        <div className="space-y-1">
                                            <h3 className="text-xl font-bold text-stone-900 flex items-center gap-2">
                                                📖 我的收藏 (My Diary)
                                            </h3>
                                            <p className="text-sm text-stone-500">你收藏过的播客文章会在这里出现</p>
                                        </div>
                                        <button
                                            onClick={() => setIsDiaryOpen(false)}
                                            className="p-2 hover:bg-stone-100 rounded-full transition-colors"
                                        >
                                            <X className="h-5 w-5 text-stone-400" />
                                        </button>
                                    </div>

                                    {savedPodcasts.length === 0 ? (
                                        <div className="py-16 text-center text-stone-500 font-medium">
                                            你还没有收藏过播客文章哦~
                                        </div>
                                    ) : (
                                        <div className="max-h-[70vh] overflow-y-auto pr-2 space-y-4">
                                            {savedPodcasts.map((p) => (
                                                <div key={p.id} className="bg-stone-50/60 border border-stone-100 rounded-2xl p-5 space-y-3">
                                                    <div className="flex items-center justify-between">
                                                        <div className="text-xs font-semibold text-stone-400">
                                                            {formatTimestamp(p.timestamp)}
                                                        </div>
                                                        <button
                                                            onClick={() => {
                                                                setSavedPodcasts(prev => prev.filter(x => x.id !== p.id));
                                                                toast("已取消收藏", "default");
                                                            }}
                                                            className="p-2 rounded-full hover:bg-white transition-colors text-stone-400 hover:text-rose-500"
                                                            title="取消收藏"
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </button>
                                                    </div>
                                                    <div className="text-sm leading-relaxed">
                                                        {renderHighlightedEnglish(p.englishText, p.targetWords)}
                                                    </div>
                                                    {p.chineseText && (
                                                        <div className="text-sm text-stone-500 leading-relaxed pt-2 border-t border-stone-100">
                                                            {p.chineseText}
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>

                {/* Customization Modal */}
                <AnimatePresence>
                    {isModalOpen && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                            <motion.div 
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                onClick={() => setIsModalOpen(false)}
                                className="absolute inset-0 bg-indigo-950/20 backdrop-blur-md"
                            />
                            <motion.div 
                                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                                className="bg-white rounded-[2rem] shadow-2xl w-full max-w-2xl overflow-hidden z-10 relative border border-indigo-50"
                            >
                                <div className="p-10 space-y-10">
                                    <div className="flex justify-between items-start">
                                        <div className="space-y-1">
                                            <h3 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                                                ✨ 选择播客主题
                                            </h3>
                                            <p className="text-sm text-gray-500">定制你的专属 AI 英语听力内容</p>
                                        </div>
                                        <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-gray-100 rounded-full transition-colors group">
                                            <X className="h-5 w-5 text-gray-400 group-hover:text-gray-600" />
                                        </button>
                                    </div>

                                    <div className="space-y-4">
                                        <label className="text-[11px] font-bold text-gray-400 uppercase tracking-[0.2em] flex items-center gap-1.5 px-1">
                                            🎯 难度选择 (Target Level)
                                        </label>
                                        <div className="grid grid-cols-3 gap-3">
                                            {difficultyOptions.map(opt => (
                                                <button
                                                    key={opt.id}
                                                    onClick={() => setSelectedDifficulty(opt.id)}
                                                    className={cn(
                                                        "px-4 py-4 rounded-xl text-xs font-bold transition-all flex flex-col items-center gap-1.5 border shadow-sm",
                                                        selectedDifficulty === opt.id 
                                                            ? "bg-indigo-600 border-indigo-600 text-white shadow-indigo-200" 
                                                            : "bg-white border-gray-200 text-gray-700 hover:border-indigo-200 hover:bg-indigo-50/30"
                                                    )}
                                                >
                                                    {opt.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        <label className="text-[11px] font-bold text-gray-400 uppercase tracking-[0.2em] flex items-center gap-1.5 px-1">
                                            🎙️ 播客风格 (Podcast Tone)
                                        </label>
                                        <div className="grid grid-cols-3 gap-3">
                                            {tones.map(tone => (
                                                <button
                                                    key={tone.id}
                                                    onClick={() => setSelectedTone(tone.id)}
                                                    className={cn(
                                                        "px-4 py-5 rounded-xl text-xs font-bold transition-all flex flex-col items-center gap-2 border shadow-sm",
                                                        selectedTone === tone.id 
                                                            ? "bg-indigo-600 border-indigo-600 text-white shadow-indigo-200" 
                                                            : "bg-white border-gray-100 text-gray-600 hover:border-indigo-200 hover:bg-indigo-50/30"
                                                    )}
                                                >
                                                    <span className="text-lg">{tone.emoji}</span>
                                                    {tone.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Theme Selection (2-column Grid) */}
                                    <div className="space-y-4">
                                        <label className="text-[11px] font-bold text-gray-400 uppercase tracking-[0.2em] flex items-center gap-1.5 px-1">
                                            📚 故事场景 (Story Theme)
                                        </label>
                                        <div className="grid grid-cols-2 gap-3">
                                            {themes.map(theme => (
                                                <button
                                                    key={theme.id}
                                                    onClick={() => setSelectedTheme(theme.id)}
                                                    className={cn(
                                                        "px-5 py-4 rounded-xl text-sm font-semibold transition-all border-2 text-left flex items-center gap-3",
                                                        selectedTheme === theme.id 
                                                            ? "bg-indigo-50/50 border-indigo-600 text-indigo-700 shadow-sm" 
                                                            : "bg-white border-gray-100 text-gray-500 hover:border-indigo-100 hover:bg-indigo-50/20"
                                                    )}
                                                >
                                                    <span className="text-xl">{theme.emoji}</span>
                                                    {theme.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <Button 
                                        onClick={generateStory}
                                        className="w-full h-14 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-base shadow-xl shadow-indigo-100 transition-all active:scale-[0.98] gap-2 mt-2"
                                    >
                                        <Sparkles className="h-4 w-4" />
                                        生成专属播客
                                    </Button>
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>

                {/* Main Podcast Card */}
                <div className="relative flex flex-col gap-6 overflow-hidden rounded-2xl bg-white p-5 shadow-xl shadow-stone-200/50 sm:gap-8 sm:p-8 md:gap-10 md:rounded-[2.5rem] md:p-12">
                    <div className="absolute left-0 top-0 h-1.5 w-full bg-amber-500/10" />
                    
                    {/* Story Content Area */}
                    <div className="flex min-h-[180px] items-start sm:min-h-[220px]">
                        <div className="relative w-full">
                            <Quote className="pointer-events-none absolute -left-4 -top-4 -z-10 h-10 w-10 text-stone-50 sm:-left-8 sm:-top-8 sm:h-12 sm:w-12" />
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                                <div className="min-w-0 select-text text-left text-[17px] font-medium leading-[1.75] text-stone-700 selection:bg-amber-200 selection:text-stone-900 sm:text-xl md:text-2xl md:leading-[1.8]">
                                    {renderWordTrackingStory()}
                                </div>
                                {!isLoading && story && (
                                    <FavoriteStarBurstButton
                                        active={isCurrentSaved}
                                        variant="amber"
                                        title="收藏至日记"
                                        className={cn(
                                            'self-end sm:mt-1 sm:self-start sm:shrink-0',
                                            isCurrentSaved
                                                ? 'bg-amber-50/90 text-amber-500'
                                                : 'text-stone-300 hover:bg-amber-50/90 hover:text-amber-500'
                                        )}
                                        starClassName="h-6 w-6"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            handleSavePodcast();
                                        }}
                                    />
                                )}
                            </div>
                            
                            {/* 中文翻译区域 */}
                            <AnimatePresence>
                                {showTranslation && chineseTranslation && (
                                    <motion.div 
                                        initial={{ opacity: 0, y: -10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -10 }}
                                        className="mt-6 pt-6 border-t border-stone-100"
                                    >
                                        <p className="text-sm md:text-base text-stone-500 leading-relaxed font-medium">
                                            {chineseTranslation}
                                        </p>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>

                    {/* Player Controls + Shadowing */}
                    <div className="space-y-6 border-t border-stone-50 pt-6 sm:space-y-8 sm:pt-8">
                        {!isLoading && story && (
                            <div className="rounded-2xl border border-amber-100/90 bg-gradient-to-br from-amber-50/80 to-white px-4 py-3 space-y-3 shadow-sm shadow-amber-100/40">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] font-bold uppercase tracking-wider text-amber-900/70">Shadowing</span>
                                        <div className="flex items-center gap-0.5 rounded-xl bg-white/90 border border-amber-100/80 px-0.5 shadow-sm">
                                            <button
                                                type="button"
                                                disabled={shadowSentenceIndex <= 0 || shadowProcessing}
                                                onClick={() => setShadowSentenceIndex((i) => Math.max(0, i - 1))}
                                                className="p-1.5 rounded-lg text-stone-500 hover:bg-stone-100 disabled:opacity-25 disabled:pointer-events-none"
                                                aria-label="上一句"
                                            >
                                                <ChevronLeft className="h-4 w-4" />
                                            </button>
                                            <span className="text-[11px] font-mono tabular-nums text-stone-600 px-1.5 min-w-[3.25rem] text-center">
                                                {shadowSentences.length ? shadowSentenceIndex + 1 : 0}/{shadowSentences.length}
                                            </span>
                                            <button
                                                type="button"
                                                disabled={shadowSentenceIndex >= Math.max(0, shadowSentences.length - 1) || shadowProcessing}
                                                onClick={() =>
                                                    setShadowSentenceIndex((i) => Math.min(Math.max(0, shadowSentences.length - 1), i + 1))
                                                }
                                                className="p-1.5 rounded-lg text-stone-500 hover:bg-stone-100 disabled:opacity-25 disabled:pointer-events-none"
                                                aria-label="下一句"
                                            >
                                                <ChevronRight className="h-4 w-4" />
                                            </button>
                                        </div>
                                    </div>
                                    <p className="text-xs text-stone-600 leading-relaxed flex-1 min-w-[min(100%,14rem)]">
                                        <span className="font-semibold text-stone-800">本句跟读：</span>
                                        {shadowRefText}
                                    </p>
                                </div>
                                <p className="text-[11px] text-stone-400 leading-snug">
                                    先听播放，再<strong className="text-stone-600">按住麦克风按钮</strong>朗读当前句；松开后查看流畅度与薄弱词。已配置环境变量{' '}
                                    <code className="text-[10px] bg-white/80 px-1 py-0.5 rounded border border-stone-100">VITE_PRONUNCIATION_API_URL</code>{' '}
                                    时将上传录音进行服务端评分。
                                </p>
                            </div>
                        )}

                        <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
                            {/* Minimal Waveform Visualizer */}
                            <div className="h-8 flex items-center gap-1 justify-center lg:justify-start">
                                {isPlaying ? (
                                    <div className="flex items-center gap-1">
                                        {[...Array(12)].map((_, i) => (
                                            <motion.div
                                                key={i}
                                                className="w-1 bg-amber-500/60 rounded-full"
                                                animate={{ height: [4, 16, 8, 24, 4] }}
                                                transition={{ 
                                                    duration: 0.6 + Math.random() * 0.4, 
                                                    repeat: Infinity, 
                                                    delay: i * 0.05,
                                                    ease: "easeInOut" 
                                                }}
                                            />
                                        ))}
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-1">
                                        {[...Array(12)].map((_, i) => (
                                            <div key={i} className="w-1 h-1 bg-stone-200 rounded-full" />
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="flex items-center justify-center gap-4 sm:gap-6 flex-wrap">
                                <button
                                    type="button"
                                    onClick={() => {
                                        stopAudio();
                                        playAudio();
                                    }}
                                    disabled={!story || isLoading}
                                    className="p-2 text-stone-400 hover:text-stone-600 transition-colors disabled:opacity-30"
                                    title="从头播放"
                                >
                                    <RotateCcw className="h-5 w-5" />
                                </button>
                                <button 
                                    type="button"
                                    onClick={togglePlay}
                                    className="h-20 w-20 bg-stone-900 rounded-full flex items-center justify-center text-stone-50 shadow-xl shadow-stone-900/20 hover:bg-stone-800 hover:scale-105 transition-all active:scale-95 group"
                                >
                                    {isPlaying ? <Pause className="h-8 w-8 fill-current" /> : <Play className="h-8 w-8 fill-current ml-1" />}
                                </button>
                                <button type="button" className="p-2 text-stone-400 hover:text-stone-600 transition-colors" title="暂未接入跳句">
                                    <SkipForward className="h-5 w-5" />
                                </button>

                                {/* 按住跟读 */}
                                <div className="flex flex-col items-center gap-1.5 sm:ml-1">
                                    <button
                                        type="button"
                                        disabled={!shadowRefText.trim() || isLoading || shadowProcessing}
                                        onPointerDown={(e) => {
                                            e.preventDefault();
                                            if (!shadowRefText.trim() || isLoading || shadowProcessing) return;
                                            const finish = () => {
                                                window.removeEventListener('pointerup', finish);
                                                window.removeEventListener('pointercancel', finish);
                                                void endShadowSession();
                                            };
                                            window.addEventListener('pointerup', finish);
                                            window.addEventListener('pointercancel', finish);
                                            void beginShadowSession();
                                        }}
                                        className={cn(
                                            'relative flex h-16 w-16 items-center justify-center rounded-full border-2 transition-all select-none touch-none',
                                            shadowRecording
                                                ? 'border-rose-500 bg-rose-50 text-rose-600 scale-95 shadow-lg shadow-rose-200/40'
                                                : 'border-stone-200 bg-white text-amber-700 hover:border-amber-300 hover:bg-amber-50/60 shadow-md',
                                            (!shadowRefText.trim() || isLoading || shadowProcessing) &&
                                                'opacity-40 pointer-events-none'
                                        )}
                                        aria-label="按住进行跟读"
                                    >
                                        {shadowProcessing ? (
                                            <Loader2 className="h-6 w-6 animate-spin text-amber-600" />
                                        ) : (
                                            <Mic className={cn('h-6 w-6', shadowRecording && 'animate-pulse')} />
                                        )}
                                        {shadowRecording && (
                                            <span className="pointer-events-none absolute inset-0 rounded-full border-2 border-rose-400 opacity-35 animate-ping" />
                                        )}
                                    </button>
                                    <span className="text-[10px] font-semibold text-stone-400 uppercase tracking-wide text-center max-w-[5.5rem] leading-tight">
                                        {shadowProcessing ? '分析中…' : shadowRecording ? '收音中…' : '按住跟读'}
                                    </span>
                                </div>
                            </div>

                            <div className="text-center lg:text-right text-stone-400 font-mono text-xs tabular-nums lg:w-28 lg:shrink-0">
                                <div>{isPlaying ? 'Live Tracking' : 'Paused'}</div>
                                {shadowRecording && <div className="text-rose-500 mt-1 font-sans font-semibold">Recording</div>}
                            </div>
                        </div>

                        {shadowResult && (
                            <motion.div
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="rounded-2xl border border-stone-200 bg-white p-5 md:p-6 shadow-sm space-y-5"
                            >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <h4 className="text-sm font-bold text-stone-900">口语反馈</h4>
                                    <span
                                        className={cn(
                                            'text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full',
                                            shadowResult.source === 'api'
                                                ? 'bg-indigo-100 text-indigo-700'
                                                : 'bg-stone-100 text-stone-600'
                                        )}
                                    >
                                        {shadowResult.source === 'api' ? 'API 评估' : '本机识别 · 参考分'}
                                    </span>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                                    {[
                                        { label: '流畅度', value: shadowResult.fluencyScore },
                                        { label: '准确度', value: shadowResult.accuracyScore },
                                        { label: '重音 / 节奏', value: shadowResult.stressScore },
                                    ].map((row) => (
                                        <div key={row.label} className="space-y-2">
                                            <div className="flex justify-between text-[11px] text-stone-500 font-semibold">
                                                <span>{row.label}</span>
                                                <span className="tabular-nums text-stone-800">{row.value}%</span>
                                            </div>
                                            <Progress value={row.value} />
                                        </div>
                                    ))}
                                </div>

                                {Boolean(shadowResult.transcript) && (
                                    <div className="rounded-xl bg-stone-50 border border-stone-100 px-3 py-2 text-xs">
                                        <span className="font-bold text-stone-400 uppercase tracking-wide text-[10px]">识别内容</span>
                                        <p className="mt-1 text-stone-800 leading-relaxed">{shadowResult.transcript}</p>
                                    </div>
                                )}

                                <div>
                                    <span className="text-[11px] font-bold text-stone-400 uppercase tracking-wide">参考句逐词</span>
                                    <p className="text-[11px] text-stone-400 mt-0.5 mb-2">标红表示与识别结果匹配较弱，可多加模仿原音频。</p>
                                    <div className="flex flex-wrap gap-x-2 gap-y-1.5 text-sm">
                                        {shadowResult.words.map((w, idx) => (
                                            <span
                                                key={`${w.word}-${idx}`}
                                                className={cn(
                                                    'rounded-md px-2 py-0.5 transition-colors',
                                                    w.ok
                                                        ? 'text-stone-800 bg-stone-100/80'
                                                        : 'text-red-700 bg-red-50 font-semibold ring-1 ring-red-100'
                                                )}
                                            >
                                                {w.word}
                                                {!w.ok && (
                                                    <span className="ml-1 text-[10px] font-mono opacity-80">{w.accuracy}%</span>
                                                )}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </div>
                </div>

                {/* Vocabulary Footer */}
                <div className="flex flex-col items-center gap-6 px-2 pb-6">
                    <div className="flex flex-col items-center gap-5 w-full">
                        <div className="flex items-center gap-2.5 text-[11px] text-stone-400 uppercase tracking-[0.2em] font-bold">
                            <Headphones className="h-3.5 w-3.5" /> Focus Vocabulary
                        </div>
                        <div className="flex flex-wrap justify-center gap-3">
                            {targetWords.map(word => {
                                const isMastered = masteredWords.includes(word);
                                const alreadyInBank = isInWordBank(word);
                                return (
                                    <button 
                                        key={word} 
                                        onClick={() => {
                                            if (isMastered) {
                                                setMasteredWords(prev => prev.filter(w => w !== word));
                                            } else {
                                                setMasteredWords(prev => [...prev, word]);
                                            }
                                        }}
                                        className={cn(
                                            "px-3 py-2 border rounded-full text-xs font-bold shadow-sm hover:shadow-md transition-all flex items-center gap-1.5",
                                            isMastered 
                                                ? "bg-emerald-100 border-emerald-200 text-emerald-700" 
                                                : "bg-white border-stone-200 text-amber-600 hover:bg-stone-50"
                                        )}
                                    >
                                        {isMastered && <Check className="h-3.5 w-3.5" />}
                                        {word}
                                        <span
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleAddPodcastWord(word);
                                            }}
                                            className={cn(
                                                "ml-1 inline-flex items-center justify-center rounded-full p-1 border transition-colors",
                                                alreadyInBank
                                                    ? "border-emerald-200 bg-emerald-50 text-emerald-600"
                                                    : "border-amber-200 bg-amber-50 text-amber-600 hover:bg-amber-100"
                                            )}
                                            title={alreadyInBank ? "已在生词本中" : "添加到生词本"}
                                            aria-label={alreadyInBank ? "已在生词本中" : "添加到生词本"}
                                        >
                                            {alreadyInBank ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                    
                    {/* Completion CTA */}
                    <div className="pt-4 w-full flex justify-center border-t border-stone-200/50">
                        <Button
                            onClick={handleCompleteSession}
                            disabled={!hasPlayed && masteredWords.length === 0}
                            className={cn(
                                "h-12 px-8 rounded-xl font-bold text-sm shadow-md transition-all flex items-center gap-2",
                                (!hasPlayed && masteredWords.length === 0)
                                    ? "bg-stone-200 text-stone-400 cursor-not-allowed shadow-none"
                                    : "bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-200 hover:scale-105 active:scale-95"
                            )}
                        >
                            <Sparkles className="h-4 w-4" />
                            完成本次复习 (Complete Session)
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
