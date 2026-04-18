import * as React from 'react';
import { BookOpen, ChevronRight } from 'lucide-react';
import { CourseDetail } from '@/pages/CourseDetail';
import { MICRO_LESSON_TITLE } from '@/lib/micro-lesson-mock';

export function CoursesPage() {
    const [showDetail, setShowDetail] = React.useState(false);

    if (showDetail) {
        return <CourseDetail onBack={() => setShowDetail(false)} />;
    }

    return (
        <div className="relative mx-auto max-w-2xl px-4 pb-16 pt-4 sm:px-6 sm:pt-8">
            <div
                className="pointer-events-none absolute inset-0 -z-10 rounded-[2rem] opacity-90"
                style={{
                    background: 'linear-gradient(165deg, #f5f0e8 0%, #eaf4f1 55%, #f8faf9 100%)',
                }}
            />
            <header className="mb-12 text-center sm:mb-16">
                <h1 className="text-2xl font-semibold tracking-tight text-slate-800 sm:text-3xl">我的课程</h1>
                <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-slate-600">
                    以「可理解输入 → 可控输出 → 回顾巩固」组织每一节微课，告别冗长视频列表。
                </p>
            </header>

            <button
                type="button"
                onClick={() => setShowDetail(true)}
                className="group w-full rounded-[1.75rem] border-0 bg-white/55 p-8 text-left shadow-[0_12px_48px_-20px_rgba(15,118,110,0.18)] ring-1 ring-white/80 backdrop-blur-xl transition hover:bg-white/70 hover:shadow-lg sm:p-10"
            >
                <div className="flex items-start gap-5">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-400/90 to-cyan-500/75 text-white shadow-md shadow-teal-600/20">
                        <BookOpen className="h-7 w-7" strokeWidth={2} />
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold uppercase tracking-[0.2em] text-teal-700/90">情景微课</p>
                        <h2 className="mt-2 text-lg font-semibold text-slate-800 sm:text-xl">{MICRO_LESSON_TITLE}</h2>
                        <p className="mt-3 text-sm leading-relaxed text-slate-600">
                            三步通关：对话输入、AI 点单输出、收录生词。纯前端演示，可随时扩展与 AI 对话联动。
                        </p>
                        <span className="mt-6 inline-flex items-center gap-1 text-sm font-semibold text-teal-700 transition group-hover:gap-2">
                            进入微课
                            <ChevronRight className="h-4 w-4" />
                        </span>
                    </div>
                </div>
            </button>
        </div>
    );
}
