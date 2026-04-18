import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, XCircle, RotateCcw } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { ReadingQuizItem } from '@/store/readingLibraryStore';

interface ReadingQuizProps {
    items: ReadingQuizItem[];
}

const LETTERS = ['A', 'B', 'C', 'D'] as const;

export function ReadingQuiz({ items }: ReadingQuizProps) {
    const [answers, setAnswers] = useState<Record<number, string>>({});
    const [submitted, setSubmitted] = useState(false);

    const correctCount = useMemo(() => {
        if (!submitted) return 0;
        return items.reduce((acc, q, idx) => (answers[idx] === q.answer ? acc + 1 : acc), 0);
    }, [submitted, answers, items]);

    if (!items || items.length === 0) return null;

    const allAnswered = items.every((_, idx) => !!answers[idx]);

    const handleSelect = (qIdx: number, letter: string) => {
        if (submitted) return;
        setAnswers((prev) => ({ ...prev, [qIdx]: letter }));
    };

    const handleReset = () => {
        setAnswers({});
        setSubmitted(false);
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                    <h3 className="text-lg font-semibold">阅读理解</h3>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                        {items.length} 题
                    </span>
                </div>
                {submitted && (
                    <div className="flex items-center gap-2 text-sm">
                        <span className="text-muted-foreground">
                            答对 <span className="text-primary font-semibold">{correctCount}</span> / {items.length}
                        </span>
                        <Button variant="ghost" size="sm" onClick={handleReset} className="h-9">
                            <RotateCcw className="mr-1 h-3 w-3" />
                            重做
                        </Button>
                    </div>
                )}
            </div>

            <div className="space-y-4">
                {items.map((q, qIdx) => {
                    const picked = answers[qIdx];
                    const isCorrect = submitted && picked === q.answer;
                    return (
                        <Card key={qIdx} className="p-4 space-y-3">
                            <div className="flex items-start gap-2">
                                <span className="text-sm font-semibold text-muted-foreground shrink-0">Q{qIdx + 1}.</span>
                                <p className="text-sm font-medium flex-1">{q.question}</p>
                            </div>

                            <div className="space-y-2">
                                {q.options.map((opt, optIdx) => {
                                    const letter = LETTERS[optIdx];
                                    const selected = picked === letter;
                                    const isAnswer = letter === q.answer;
                                    let stateCls = 'border-border hover:border-primary/60 hover:bg-accent/40';
                                    if (submitted) {
                                        if (isAnswer) stateCls = 'border-green-500 bg-green-500/10';
                                        else if (selected) stateCls = 'border-destructive bg-destructive/10';
                                        else stateCls = 'border-border opacity-70';
                                    } else if (selected) {
                                        stateCls = 'border-primary bg-primary/10';
                                    }

                                    return (
                                        <button
                                            key={optIdx}
                                            type="button"
                                            onClick={() => handleSelect(qIdx, letter)}
                                            disabled={submitted}
                                            className={`w-full text-left rounded-md border px-3 py-2 text-sm transition-colors flex items-start gap-3 ${stateCls}`}
                                        >
                                            <span className="font-semibold shrink-0">{letter}.</span>
                                            <span className="flex-1">{opt}</span>
                                            {submitted && isAnswer && (
                                                <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                                            )}
                                            {submitted && selected && !isAnswer && (
                                                <XCircle className="h-4 w-4 text-destructive shrink-0" />
                                            )}
                                        </button>
                                    );
                                })}
                            </div>

                            <AnimatePresence>
                                {submitted && q.explanationZh && (
                                    <motion.div
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        exit={{ opacity: 0, height: 0 }}
                                        className="overflow-hidden"
                                    >
                                        <div
                                            className={`rounded-md border p-3 text-sm ${
                                                isCorrect
                                                    ? 'border-green-500/40 bg-green-500/5'
                                                    : 'border-amber-500/40 bg-amber-500/5'
                                            }`}
                                        >
                                            <div className="font-semibold mb-1">
                                                {isCorrect ? '正确！' : `正确答案：${q.answer}`}
                                            </div>
                                            <div className="text-foreground/80">{q.explanationZh}</div>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </Card>
                    );
                })}
            </div>

            {!submitted && (
                <div className="flex justify-end">
                    <Button onClick={() => setSubmitted(true)} disabled={!allAnswered}>
                        提交答案
                    </Button>
                </div>
            )}
        </div>
    );
}
