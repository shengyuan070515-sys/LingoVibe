import * as React from 'react';
import { Fragment } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, ArrowRight, Check, Sparkles, BookMarked } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { MicroLessonChat } from '@/components/micro-lesson/micro-lesson-chat';
import { type Message } from '@/lib/ai-chat';
import {
    missingLexiconLabels,
    type LexiconCoverage,
    type LexiconProgressPayload,
} from '@/lib/micro-lesson-mission';
import {
    MICRO_LESSON_OPENING_LINE,
    MICRO_LESSON_TITLE,
    MOCK_DIALOGUE,
    MISSION_COPY,
    TARGET_LEXEMES,
    type DialogueLine,
} from '@/lib/micro-lesson-mock';
import { useWordBankStore } from '@/store/wordBankStore';
import { useToast } from '@/components/ui/toast';

const steps = [
    { id: 0, key: 'input', label: 'Input', sub: '情景输入' },
    { id: 1, key: 'output', label: 'Output', sub: '输出任务' },
    { id: 2, key: 'review', label: 'Review', sub: '通关回顾' },
] as const;

function Stepper({ active }: { active: number }) {
    return (
        <div className="mx-auto w-full max-w-lg">
            <div className="flex items-center justify-between gap-2 px-1">
                {steps.map((s, i) => (
                    <Fragment key={s.key}>
                        <div className="flex flex-1 flex-col items-center gap-2">
                            <motion.div
                                className={cn(
                                    'flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold shadow-sm ring-2 transition-colors',
                                    active === i
                                        ? 'bg-teal-500 text-white ring-teal-200'
                                        : active > i
                                          ? 'bg-teal-100 text-teal-700 ring-teal-100'
                                          : 'bg-white/80 text-slate-400 ring-slate-200/80'
                                )}
                                animate={active === i ? { scale: [1, 1.06, 1] } : { scale: 1 }}
                                transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                            >
                                {active > i ? <Check className="h-5 w-5" strokeWidth={2.5} /> : i + 1}
                            </motion.div>
                            <div className="text-center">
                                <p
                                    className={cn(
                                        'text-[11px] font-semibold uppercase tracking-[0.14em]',
                                        active === i ? 'text-teal-700' : 'text-slate-400'
                                    )}
                                >
                                    {s.label}
                                </p>
                                <p className="text-xs text-slate-500">{s.sub}</p>
                            </div>
                        </div>
                        {i < steps.length - 1 ? (
                            <div
                                className="mx-1 mb-8 h-1 min-w-[1.5rem] flex-1 self-center overflow-hidden rounded-full bg-slate-200/90 sm:mx-2 sm:min-w-[2.5rem]"
                                aria-hidden
                            >
                                <motion.div
                                    className="h-full origin-left rounded-full bg-teal-400/90"
                                    initial={false}
                                    animate={{ scaleX: active > i ? 1 : 0 }}
                                    transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                                />
                            </div>
                        ) : null}
                    </Fragment>
                ))}
            </div>
        </div>
    );
}

function DialogueCard({ line }: { line: DialogueLine }) {
    const isCustomer = line.role === 'customer';
    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            className={cn('flex w-full', isCustomer ? 'justify-start' : 'justify-end')}
        >
            <div
                className={cn(
                    'max-w-[min(100%,28rem)] rounded-3xl px-5 py-4 text-[15px] leading-relaxed shadow-sm ring-1 backdrop-blur-md',
                    isCustomer
                        ? 'bg-white/75 text-slate-700 ring-white/80'
                        : 'bg-teal-50/80 text-slate-700 ring-teal-100/80'
                )}
            >
                <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
                    {line.roleLabel}
                </p>
                <p className="text-slate-600">
                    {line.parts.map((p, idx) =>
                        p.highlight ? (
                            <span
                                key={idx}
                                className="mx-0.5 rounded-md bg-sky-100/90 px-1.5 py-0.5 font-medium text-sky-900"
                            >
                                {p.text}
                            </span>
                        ) : (
                            <span key={idx}>{p.text}</span>
                        )
                    )}
                </p>
            </div>
        </motion.div>
    );
}

const slide = {
    initial: { opacity: 0, x: 28 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -22 },
};

export function CourseDetail({ onBack }: { onBack: () => void }) {
    const [step, setStep] = React.useState(0);
    const [syncedPulse, setSyncedPulse] = React.useState(false);
    const [microLessonMessages, setMicroLessonMessages] = React.useState<Message[]>(() => [
        { role: 'assistant', content: MICRO_LESSON_OPENING_LINE },
    ]);
    const [lexicon, setLexicon] = React.useState<{
        complete: boolean;
        coverage: LexiconCoverage;
    }>({
        complete: false,
        coverage: { iced: false, oatMilk: false, alternative: false },
    });
    const addWord = useWordBankStore((s) => s.addWord);
    const { toast } = useToast();

    const handleLexiconProgress = React.useCallback(
        (p: LexiconProgressPayload) => {
            setLexicon((prev) => {
                if (p.complete && !prev.complete) {
                    toast('本关词汇目标已达成，可继续与店员对话或进入回顾。', 'success');
                }
                return { complete: p.complete, coverage: p.coverage };
            });
        },
        [toast]
    );

    const goNext = () => {
        if (step === 1 && !lexicon.complete) {
            toast(`请先完成词汇目标，还差：${missingLexiconLabels(lexicon.coverage).join('、')}`, 'error');
            return;
        }
        setStep((s) => Math.min(2, s + 1));
    };
    const goPrev = () => setStep((s) => Math.max(0, s - 1));

    const handleSyncToWordBank = async () => {
        setSyncedPulse(true);
        const ctx = `${MICRO_LESSON_TITLE} · Step2 输出任务`;
        for (const w of TARGET_LEXEMES) {
            await addWord({
                word: w,
                type: w.includes(' ') ? 'sentence' : 'word',
                context: ctx,
            });
        }
        toast('本关目标词已提交收录（已在生词本中的会自动跳过）', 'success');
        window.setTimeout(() => setSyncedPulse(false), 900);
    };

    return (
        <div className="relative min-h-[min(100%,720px)] w-full">
            <div
                className="pointer-events-none absolute inset-0 -z-10 rounded-[2rem] opacity-95"
                style={{
                    background:
                        'linear-gradient(160deg, #f5f0e8 0%, #eaf4f1 42%, #e4f0ec 100%)',
                }}
            />

            <div className="mx-auto max-w-3xl px-4 pb-16 pt-6 sm:px-6 sm:pt-10">
                <button
                    type="button"
                    onClick={onBack}
                    className="mb-8 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-white/50 hover:text-slate-800"
                >
                    <ArrowLeft className="h-4 w-4" />
                    返回课程列表
                </button>

                <header className="mb-12 text-center sm:mb-14">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-teal-700/80">Micro lesson</p>
                    <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-800 sm:text-3xl">
                        {MICRO_LESSON_TITLE}
                    </h1>
                    <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-slate-600">
                        先读情景对话建立可理解输入，再在任务里完成输出，最后一键回顾并收录生词。
                    </p>
                </header>

                <Stepper active={step} />

                <div className="relative mt-14 min-h-[20rem] sm:mt-16">
                    <AnimatePresence mode="wait">
                        {step === 0 ? (
                            <motion.section
                                key="input"
                                {...slide}
                                transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
                                className="space-y-8"
                            >
                                <div className="rounded-[1.75rem] bg-white/50 p-8 shadow-sm ring-1 ring-white/80 backdrop-blur-xl sm:p-10">
                                    <h2 className="text-lg font-semibold text-slate-800">Step 1 · 情景输入</h2>
                                    <p className="mt-2 text-sm leading-relaxed text-slate-600">
                                        在咖啡店点一杯去冰燕麦拿铁。注意蓝色高亮的目标词，稍后要亲口用上它们。
                                    </p>
                                    <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_12.5rem] lg:items-start lg:gap-10">
                                        <div className="flex flex-col gap-5">
                                            {MOCK_DIALOGUE.map((line) => (
                                                <DialogueCard key={line.id} line={line} />
                                            ))}
                                        </div>
                                        <aside className="hidden rounded-2xl bg-teal-50/55 p-5 text-left text-xs leading-relaxed text-slate-600 ring-1 ring-teal-100/70 backdrop-blur-sm lg:block">
                                            <p className="font-semibold text-teal-900">输入提示</p>
                                            <p className="mt-3">
                                                先整体听懂店员如何确认{' '}
                                                <span className="font-medium text-sky-800">iced</span> 与奶制品
                                                选择；再跟读蓝色高亮词，建立发音与语义绑定。
                                            </p>
                                        </aside>
                                    </div>
                                </div>
                            </motion.section>
                        ) : null}

                        {step === 1 ? (
                            <motion.section
                                key="output"
                                {...slide}
                                transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
                                className="space-y-8"
                            >
                                <div className="rounded-[1.75rem] bg-white/50 p-8 shadow-sm ring-1 ring-white/80 backdrop-blur-xl sm:p-10">
                                    <h2 className="text-lg font-semibold text-slate-800">Step 2 · 输出任务</h2>
                                    <div className="mt-6 rounded-2xl border border-dashed border-teal-200/80 bg-teal-50/40 px-5 py-5 backdrop-blur-sm">
                                        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-teal-800/90">
                                            Mission
                                        </p>
                                        <p className="mt-3 text-base font-medium leading-relaxed text-slate-700">
                                            {MISSION_COPY}
                                        </p>
                                        <div className="mt-4 flex flex-wrap gap-2">
                                            {TARGET_LEXEMES.map((w) => (
                                                <span
                                                    key={w}
                                                    className="rounded-full bg-sky-100/90 px-3 py-1 text-xs font-semibold text-sky-900"
                                                >
                                                    {w}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                    <div
                                        className="mt-5 flex flex-wrap items-center gap-2"
                                        role="status"
                                        aria-live="polite"
                                        aria-label="本关词汇在对话中的出现进度"
                                    >
                                        {(
                                            [
                                                { key: 'iced' as const, label: 'iced' },
                                                { key: 'oatMilk' as const, label: 'oat milk' },
                                                { key: 'alternative' as const, label: 'alternative' },
                                            ] as const
                                        ).map(({ key, label }) => {
                                            const done = lexicon.coverage[key];
                                            return (
                                                <span
                                                    key={key}
                                                    className={cn(
                                                        'inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ring-1',
                                                        done
                                                            ? 'bg-emerald-50 text-emerald-900 ring-emerald-200/90'
                                                            : 'bg-slate-50 text-slate-600 ring-slate-200/80'
                                                    )}
                                                >
                                                    {done ? <Check className="h-3.5 w-3.5" strokeWidth={2.5} /> : null}
                                                    {label}
                                                </span>
                                            );
                                        })}
                                    </div>
                                    <div className="mt-10">
                                        <MicroLessonChat
                                            messages={microLessonMessages}
                                            onMessagesChange={setMicroLessonMessages}
                                            onLexiconProgress={handleLexiconProgress}
                                        />
                                    </div>
                                    <p className="mt-4 text-center text-[11px] leading-relaxed text-slate-500 sm:text-left">
                                        对话由服务端 AI 代理生成，无需额外配置；语音仅在浏览器内识别为文字，不上传录音文件。
                                    </p>
                                </div>
                            </motion.section>
                        ) : null}

                        {step === 2 ? (
                            <motion.section
                                key="review"
                                {...slide}
                                transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
                                className="space-y-8"
                            >
                                <div className="rounded-[1.75rem] bg-white/50 p-8 text-center shadow-sm ring-1 ring-white/80 backdrop-blur-xl sm:p-12">
                                    <motion.div
                                        initial={{ scale: 0.85, opacity: 0 }}
                                        animate={{ scale: 1, opacity: 1 }}
                                        transition={{ type: 'spring', stiffness: 320, damping: 22 }}
                                        className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-teal-400 to-emerald-500 text-white shadow-lg shadow-teal-600/25"
                                    >
                                        <Check className="h-10 w-10" strokeWidth={2.5} />
                                    </motion.div>
                                    <h2 className="mt-8 text-xl font-semibold text-slate-800">通关成功</h2>
                                    <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-slate-600">
                                        你已经完成本关的输入—输出闭环。把本课目标词收进生词本，方便在闪卡与每日阅读里继续巩固。
                                    </p>
                                    <motion.div
                                        className="mt-10 flex justify-center"
                                        animate={
                                            syncedPulse
                                                ? { scale: [1, 1.04, 1], rotate: [0, -1.5, 1.5, 0] }
                                                : {}
                                        }
                                        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                                    >
                                        <Button
                                            type="button"
                                            onClick={() => void handleSyncToWordBank()}
                                            className="group relative h-12 overflow-hidden rounded-full bg-teal-600 px-8 text-sm font-semibold text-white shadow-md shadow-teal-700/20 transition hover:bg-teal-700"
                                        >
                                            <span className="pointer-events-none absolute inset-0 translate-x-[-100%] bg-gradient-to-r from-transparent via-white/25 to-transparent transition duration-700 group-hover:translate-x-[100%]" />
                                            <span className="relative flex items-center gap-2">
                                                <BookMarked className="h-4 w-4" />
                                                将生词同步至我的生词本
                                                <Sparkles className="h-4 w-4 opacity-80" />
                                            </span>
                                        </Button>
                                    </motion.div>
                                    <p className="mt-4 text-xs text-slate-500">
                                        调用与 AI 对话相同的生词本逻辑；重复词条不会重复添加。
                                    </p>
                                </div>
                            </motion.section>
                        ) : null}
                    </AnimatePresence>
                </div>

                <div className="mt-12 flex flex-col gap-3">
                    {step === 1 && !lexicon.complete ? (
                        <p
                            id="micro-lesson-next-hint"
                            className="text-center text-xs leading-relaxed text-amber-900/90 sm:text-left"
                        >
                            在对话中自然使用三个目标词后即可进入「通关回顾」。点击「下一步」时会提示尚未出现的词。
                        </p>
                    ) : null}
                    <div className="flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:justify-between">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={goPrev}
                        disabled={step === 0}
                        className="h-11 rounded-full border-slate-200/90 bg-white/60 text-slate-700 backdrop-blur-sm hover:bg-white/90 disabled:opacity-40"
                    >
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        上一步
                    </Button>
                    {step < 2 ? (
                        <Button
                            type="button"
                            onClick={goNext}
                            aria-describedby={step === 1 && !lexicon.complete ? 'micro-lesson-next-hint' : undefined}
                            aria-label={
                                step === 1 && !lexicon.complete
                                    ? '下一步：未完成词汇目标时将提示还差哪些词'
                                    : '下一步'
                            }
                            className="h-11 rounded-full bg-teal-600 px-8 text-white shadow-md shadow-teal-700/15 hover:bg-teal-700"
                        >
                            下一步
                            <ArrowRight className="ml-2 h-4 w-4" />
                        </Button>
                    ) : (
                        <Button
                            type="button"
                            variant="outline"
                            onClick={onBack}
                            className="h-11 rounded-full border-teal-200/90 bg-white/70 text-teal-800 backdrop-blur-sm hover:bg-white"
                        >
                            回到列表
                        </Button>
                    )}
                    </div>
                </div>
            </div>
        </div>
    );
}
