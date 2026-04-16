import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { fetchWordDetails } from '@/lib/word-utils';
import { fetchUnsplashImages } from '@/lib/unsplash';
import { patchWordAfterForgot, patchWordAfterKnow, patchWordAfterLearning } from '@/lib/srs-utils';
import { recordWordAdded, recordSrsReviews } from '@/store/learningAnalyticsStore';
import { useReviewLogStore } from '@/store/reviewLogStore';

export type WordBankSortMode = 'added-desc' | 'added-asc' | 'alpha' | 'review-soon' | 'level-desc';

export interface WordBankItem {
    id: string; 
    word: string; 
    phonetic: string; 
    pos: string; 
    translation: string; 
    exampleSentence: string; 
    exampleTranslation: string; 
    type: 'word' | 'sentence';
    synonyms?: string[];
    color?: string;
    images?: string[];
    context?: string; 
    addedAt: number; 
    nextReviewDate: number; 
    interval: number; 
    level: number; 
    /** 完整中文释义列表（来自 Free Dictionary + 翻译）；卡片展示只用 translation，此字段供未来多义查看等扩展 */
    allDefinitions?: string[];
}

interface WordBankState {
    words: WordBankItem[];
    addWord: (payload: unknown) => Promise<void>;
    refreshMissingDetails: () => Promise<void>;
    updateWord: (id: string, patch: Partial<WordBankItem>) => void;
    removeWord: (id: string) => void;
    updateWordProgress: (wordIds: string[]) => void;
    /** 闪卡自评：纪要 D1a/D2b，仅单词；写复习日志 H2 */
    applySrsReviewOutcome: (wordId: string, outcome: 'know' | 'forgot' | 'learning') => void;
    clearAllWords: () => void;
    /** 同类型+同词文本去重，可合并缺失字段 */
    dedupeWords: (strategy: 'keep-newest' | 'keep-rich') => number;
    sortWords: (mode: WordBankSortMode) => void;
    /** 去掉无文本条目 */
    removeInvalidWords: () => number;
}

function dedupeKey(w: WordBankItem): string {
    return `${w.type}:${w.word.trim().toLowerCase()}`;
}

function pickWinner(group: WordBankItem[], strategy: 'keep-newest' | 'keep-rich'): WordBankItem {
    if (group.length === 1) return group[0];
    if (strategy === 'keep-newest') {
        return group.reduce((a, b) => (a.addedAt >= b.addedAt ? a : b));
    }
    return group.reduce((a, b) => {
        if (a.level !== b.level) return a.level >= b.level ? a : b;
        const al = (a.translation || '').length;
        const bl = (b.translation || '').length;
        if (al !== bl) return al >= bl ? a : b;
        return a.addedAt >= b.addedAt ? a : b;
    });
}

function enrichWinner(winner: WordBankItem, losers: WordBankItem[]): WordBankItem {
    let w = { ...winner };
    for (const o of losers) {
        if (!w.phonetic && o.phonetic) w.phonetic = o.phonetic;
        if ((!w.translation || w.translation === '翻译加载中...') && o.translation && o.translation !== '翻译加载中...') {
            w.translation = o.translation;
        }
        if (!w.exampleSentence && o.exampleSentence) w.exampleSentence = o.exampleSentence;
        if (!w.exampleTranslation && o.exampleTranslation) w.exampleTranslation = o.exampleTranslation;
        if (!w.pos && o.pos) w.pos = o.pos;
        const imgs = [...(w.images ?? []), ...(o.images ?? [])];
        if (imgs.length > 0) w.images = [...new Set(imgs)];
        if ((!w.synonyms || w.synonyms.length === 0) && o.synonyms && o.synonyms.length > 0) {
            w.synonyms = o.synonyms;
        }
        if ((!w.allDefinitions || w.allDefinitions.length === 0) && o.allDefinitions && o.allDefinitions.length > 0) {
            w.allDefinitions = o.allDefinitions;
        }
    }
    return w;
}

export const useWordBankStore = create<WordBankState>()(
    persist(
        (set, get) => ({
            words: [],
            
            // 【核心修改2】终极包容版 addWord，绝不报错
            addWord: async (payload: unknown) => {
                let targetWord = "";
                let extraData: Record<string, unknown> = {};

                if (typeof payload === 'string') {
                    targetWord = payload;
                } else if (payload && typeof payload === 'object') {
                    const p = payload as Record<string, unknown>;
                    targetWord = String(p.word ?? p.query ?? p.text ?? p.content ?? "");
                    extraData = p;
                }

                if (!targetWord || typeof targetWord !== 'string') {
                    console.warn("[WordBankStore] 接收到了空数据，静默拦截", payload);
                    return; // 不抛出Error，绝对不弹报错
                }

                targetWord = targetWord.trim();

                // 2. 查重：如果有，就不加了，也不报错
                const state = get();
                if (state.words.some((w: WordBankItem) => w.word.toLowerCase() === targetWord.toLowerCase())) {
                    return;
                }

                const now = Date.now();
                const itemId = `${targetWord}-${now}`;

                const asStr = (v: unknown, fallback = ''): string =>
                    typeof v === 'string' ? v : v != null && v !== '' ? String(v) : fallback;
                const itemType: 'word' | 'sentence' = extraData.type === 'sentence' ? 'sentence' : 'word';

                const baseItem: WordBankItem = {
                    id: itemId,
                    word: targetWord,
                    phonetic: asStr(extraData.phonetic),
                    pos: asStr(extraData.pos),
                    translation:
                        asStr(extraData.translation) ||
                        asStr(extraData.meaning) ||
                        (itemType === 'sentence' ? '' : '翻译加载中...'),
                    exampleSentence: asStr(extraData.exampleSentence) || asStr(extraData.example),
                    exampleTranslation: asStr(extraData.exampleTranslation),
                    type: itemType,
                    synonyms: Array.isArray(extraData.synonyms) ? extraData.synonyms.map((s) => asStr(s)) : [],
                    color: asStr(extraData.color),
                    images: Array.isArray(extraData.images) ? extraData.images.map((s) => asStr(s)) : [],
                    context: asStr(extraData.context),
                    addedAt: now,
                    nextReviewDate: now,
                    interval: 1,
                    level: 0,
                };

                // 4. 【核心黑科技：乐观更新】先强行塞进生词本！让UI瞬间成功响应！
                set((state: WordBankState) => ({
                    words: [baseItem, ...state.words]
                }));
                recordWordAdded();

                // 5. 后台偷偷去查详情，查到了再补充进去 (不阻塞用户操作)
                try {
                    const wordDetails = await fetchWordDetails(
                        targetWord,
                        asStr(extraData.context) || undefined
                    );
                    if (wordDetails) {
                        set((state: WordBankState) => ({
                            words: state.words.map((w: WordBankItem) => 
                                w.id === itemId 
                                    ? { 
                                        ...w, 
                                        ...wordDetails,
                                        translation: wordDetails.translation || w.translation || '翻译暂不可用',
                                    } 
                                    : w
                            )
                        }));
                    }
                } catch (error) {
                    console.log("[WordBankStore] 后台补充详情失败，保留基础数据", error);
                }

                // 阅读 / AI 对话等入口通常不带配图：单词卡片在查词后补 Unsplash（无 Key 时也会返回占位图 URL）
                if (itemType === 'word') {
                    try {
                        const imgs = await fetchUnsplashImages(targetWord, { perPage: 3 });
                        if (imgs.length > 0) {
                            set((state: WordBankState) => ({
                                words: state.words.map((w: WordBankItem) =>
                                    w.id === itemId
                                        ? {
                                              ...w,
                                              images:
                                                  Array.isArray(w.images) && w.images.length > 0
                                                      ? w.images
                                                      : imgs,
                                          }
                                        : w
                                ),
                            }));
                        }
                    } catch {
                        // 静默：无图时生词本卡片仍可用
                    }
                }
            },

            refreshMissingDetails: async () => {
                const state = get();
                const targets = (Array.isArray(state.words) ? state.words : []).filter((w: WordBankItem) => {
                    if (!w || typeof w !== 'object') return false;
                    // 只补全单词卡片：缺翻译/音标/例句任一即视为需要补全
                    if (w.type !== 'word') return false;
                    return !w.translation || w.translation === '翻译加载中...' || !w.phonetic || !w.exampleSentence;
                });

                // 顺序补全，避免并发过高导致接口限流
                for (const item of targets) {
                    try {
                        const details = await fetchWordDetails(item.word, item.context);
                        let images = item.images;
                        if ((!images || images.length === 0) && item.type === 'word') {
                            const imgs = await fetchUnsplashImages(item.word, { perPage: 3 });
                            if (imgs.length > 0) images = imgs;
                        }
                        set((s: WordBankState) => ({
                            words: s.words.map((w: WordBankItem) => (
                                w.id === item.id
                                    ? {
                                        ...w,
                                        ...details,
                                        translation: details.translation || w.translation || '翻译暂不可用',
                                        ...(images && images.length > 0 ? { images } : {}),
                                    }
                                    : w
                            ))
                        }));
                    } catch {
                        // 静默失败：保持现有基础数据
                    }
                }
            },

            updateWord: (id: string, patch: Partial<WordBankItem>) =>
                set((state: WordBankState) => ({
                    words: state.words.map((w: WordBankItem) => (w.id === id ? { ...w, ...patch } : w)),
                })),

            removeWord: (id: string) => set((state: WordBankState) => ({
                words: state.words.filter((w: WordBankItem) => w.id !== id)
            })),

            updateWordProgress: (wordIds: string[]) => {
                if (wordIds.length > 0) {
                    recordSrsReviews(wordIds.length);
                }
                set((state: WordBankState) => ({
                    words: state.words.map((w: WordBankItem) =>
                        wordIds.includes(w.id) ? { ...w, ...patchWordAfterKnow(w) } : w
                    ),
                }));
            },

            applySrsReviewOutcome: (wordId: string, outcome: 'know' | 'forgot' | 'learning') => {
                recordSrsReviews(1);
                set((state: WordBankState) => {
                    const w = state.words.find((x) => x.id === wordId);
                    if (!w || w.type !== 'word') return state;
                    const patch =
                        outcome === 'know'
                            ? patchWordAfterKnow(w)
                            : outcome === 'forgot'
                              ? patchWordAfterForgot(w)
                              : patchWordAfterLearning(w);
                    const levelAfter = patch.level;
                    useReviewLogStore.getState().push({
                        wordId,
                        word: w.word,
                        outcome,
                        levelBefore: w.level,
                        levelAfter,
                    });
                    return {
                        words: state.words.map((x: WordBankItem) =>
                            x.id === wordId ? { ...x, ...patch } : x
                        ),
                    };
                });
            },
            
            clearAllWords: () => set({ words: [] }),

            dedupeWords: (strategy: 'keep-newest' | 'keep-rich') => {
                const state = get();
                const list = Array.isArray(state.words) ? state.words : [];
                const order: string[] = [];
                const groups = new Map<string, WordBankItem[]>();
                for (const w of list) {
                    if (!w?.word?.trim()) continue;
                    const k = dedupeKey(w);
                    if (!groups.has(k)) {
                        order.push(k);
                        groups.set(k, []);
                    }
                    groups.get(k)!.push(w);
                }
                let removed = 0;
                const next: WordBankItem[] = order.map((k) => {
                    const group = groups.get(k)!;
                    if (group.length === 1) return group[0];
                    const win = pickWinner(group, strategy);
                    const losers = group.filter((x) => x.id !== win.id);
                    removed += losers.length;
                    return enrichWinner(win, losers);
                });
                set({ words: next });
                return removed;
            },

            sortWords: (mode: WordBankSortMode) => {
                const words = [...(get().words || [])];
                words.sort((a, b) => {
                    switch (mode) {
                        case 'added-desc':
                            return b.addedAt - a.addedAt;
                        case 'added-asc':
                            return a.addedAt - b.addedAt;
                        case 'alpha':
                            return a.word.localeCompare(b.word, 'en', { sensitivity: 'base' });
                        case 'review-soon':
                            return a.nextReviewDate - b.nextReviewDate;
                        case 'level-desc':
                            return b.level - a.level || b.addedAt - a.addedAt;
                        default:
                            return 0;
                    }
                });
                set({ words });
            },

            removeInvalidWords: () => {
                const before = (get().words || []).length;
                const words = (get().words || []).filter(
                    (w: WordBankItem) => w && typeof w.word === 'string' && w.word.trim() !== ''
                );
                set({ words });
                return before - words.length;
            },
        }),
        {
            name: 'lingovibe_global_wordbank',
            version: 1,
            storage: createJSONStorage(() => localStorage),
            merge: (persisted: any, current: any) => {
                const persistedWords: WordBankItem[] = Array.isArray(persisted?.words) ? persisted.words : [];
                const currentWords: WordBankItem[] = Array.isArray(current?.words) ? current.words : [];

                const merged = [...currentWords, ...persistedWords].filter(Boolean);
                const seen = new Set<string>();
                const deduped: WordBankItem[] = [];

                for (const w of merged) {
                    const key = (w?.word || '').toLowerCase().trim();
                    if (!key) continue;
                    if (seen.has(key)) continue;
                    seen.add(key);
                    deduped.push(w);
                }

                return { ...current, ...persisted, words: deduped };
            },
        }
    )
);