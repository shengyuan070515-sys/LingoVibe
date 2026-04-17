import * as React from 'react';
import { equivalentWordCountForMixedText, minDwellSecondsForBrowse } from '@/lib/reading-browse-rules';

/**
 * 最低档「浏览完成」：文末哨兵进入视区 + 仅前台累计停留达到 minDwellSeconds（由正文词数决定）。
 */
export function useReadingBrowseComplete(
    scrollRootRef: React.RefObject<HTMLElement | null>,
    content: string,
    onComplete: () => void,
    options?: { summaryMode?: boolean }
) {
    const requiredMs = React.useMemo(() => {
        let sec = minDwellSecondsForBrowse(equivalentWordCountForMixedText(content));
        if (options?.summaryMode) {
            sec = Math.max(12, Math.min(sec, 28));
        }
        return sec * 1000;
    }, [content, options?.summaryMode]);

    const reachedEndRef = React.useRef(false);
    const visibleMsRef = React.useRef(0);
    const firedRef = React.useRef(false);
    const onCompleteRef = React.useRef(onComplete);
    onCompleteRef.current = onComplete;

    const [reachedEnd, setReachedEnd] = React.useState(false);
    const [progressLabel, setProgressLabel] = React.useState('');

    React.useEffect(() => {
        reachedEndRef.current = false;
        visibleMsRef.current = 0;
        firedRef.current = false;
        setReachedEnd(false);
    }, [content]);

    React.useEffect(() => {
        const root = scrollRootRef.current;
        if (!root) return;

        const sentinel = document.createElement('div');
        sentinel.setAttribute('data-reading-end-sentinel', '1');
        sentinel.style.height = '1px';
        sentinel.style.width = '100%';
        root.appendChild(sentinel);

        /**
         * 使用视口作为观察 root，兼容两种情况：
         *   - scrollRoot 自带内嵌滚动（历史做法）
         *   - scrollRoot 随页面自然流动（当前 2 列布局）
         */
        const obs = new IntersectionObserver(
            (entries) => {
                const hit = entries.some((e) => e.isIntersecting && e.intersectionRatio >= 0.25);
                if (hit) {
                    reachedEndRef.current = true;
                    setReachedEnd(true);
                }
            },
            { root: null, threshold: [0, 0.25, 0.5, 1] }
        );
        obs.observe(sentinel);

        return () => {
            obs.disconnect();
            sentinel.remove();
        };
    }, [scrollRootRef, content]);

    React.useEffect(() => {
        const tickMs = 500;
        const id = window.setInterval(() => {
            if (firedRef.current) return;
            if (document.visibilityState !== 'visible') return;
            visibleMsRef.current += tickMs;
            const sec = Math.floor(requiredMs / 1000);
            const doneSec = Math.floor(visibleMsRef.current / 1000);
            setProgressLabel(
                reachedEndRef.current
                    ? `浏览进度：有效停留 ${doneSec}/${sec} 秒（需保持本页在前台）`
                    : `请先滚动读至文末；当前有效停留 ${doneSec}/${sec} 秒`
            );
            if (reachedEndRef.current && visibleMsRef.current >= requiredMs) {
                firedRef.current = true;
                onCompleteRef.current();
                setProgressLabel('已达成本文最低阅读要求');
            }
        }, tickMs);
        return () => window.clearInterval(id);
    }, [requiredMs]);

    return { reachedEnd, requiredSeconds: Math.round(requiredMs / 1000), progressLabel };
}
