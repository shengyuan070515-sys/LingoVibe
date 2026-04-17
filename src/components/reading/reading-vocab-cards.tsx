import { useState } from 'react';
import { motion } from 'framer-motion';
import { Volume2, Plus, Check } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useWordBankStore } from '@/store/wordBankStore';
import { useToast } from '@/components/ui/toast';
import type { ReadingVocabItem } from '@/store/readingLibraryStore';

interface ReadingVocabCardsProps {
    items: ReadingVocabItem[];
}

export function ReadingVocabCards({ items }: ReadingVocabCardsProps) {
    const addWord = useWordBankStore((s) => s.addWord);
    const existingWords = useWordBankStore((s) => s.words);
    const { toast } = useToast();
    const [addedIds, setAddedIds] = useState<Set<string>>(new Set());

    if (!items || items.length === 0) return null;

    const speak = (text: string) => {
        if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'en-US';
        u.rate = 0.9;
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(u);
    };

    const isSaved = (word: string) =>
        addedIds.has(word.toLowerCase()) ||
        existingWords.some((w) => w.word.toLowerCase() === word.toLowerCase());

    const handleAdd = (item: ReadingVocabItem) => {
        void addWord({
            word: item.word,
            phonetic: item.phonetic,
            pos: item.pos,
            translation: item.definitionZh,
            exampleSentence: item.exampleSentence,
            type: 'word',
        });
        setAddedIds((prev) => new Set(prev).add(item.word.toLowerCase()));
        toast(`已加入词库：${item.word}`, 'success');
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold">重点词汇</h3>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                    {items.length}
                </span>
            </div>

            <div className="flex flex-col gap-3">
                {items.map((item, idx) => {
                    const saved = isSaved(item.word);
                    return (
                        <motion.div
                            key={`${item.word}-${idx}`}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.2, delay: idx * 0.04 }}
                        >
                            <Card className="p-4 h-full flex flex-col gap-2 hover:shadow-md transition-shadow">
                                <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-base font-semibold break-words">{item.word}</span>
                                            {item.pos && (
                                                <span className="text-xs text-muted-foreground italic">{item.pos}</span>
                                            )}
                                        </div>
                                        {item.phonetic && (
                                            <div className="text-xs text-muted-foreground mt-0.5">{item.phonetic}</div>
                                        )}
                                    </div>
                                    <div className="flex gap-1 shrink-0">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7"
                                            onClick={() => speak(item.word)}
                                            aria-label={`朗读 ${item.word}`}
                                        >
                                            <Volume2 className="h-3.5 w-3.5" />
                                        </Button>
                                        <Button
                                            variant={saved ? 'secondary' : 'ghost'}
                                            size="icon"
                                            className="h-7 w-7"
                                            onClick={() => handleAdd(item)}
                                            disabled={saved}
                                            aria-label={saved ? '已在词库' : '加入词库'}
                                        >
                                            {saved ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                                        </Button>
                                    </div>
                                </div>

                                <div className="text-sm text-foreground/90">{item.definitionZh}</div>

                                {item.exampleSentence && (
                                    <div className="text-xs text-muted-foreground italic border-l-2 border-primary/40 pl-2 mt-1">
                                        {item.exampleSentence}
                                    </div>
                                )}
                            </Card>
                        </motion.div>
                    );
                })}
            </div>
        </div>
    );
}
