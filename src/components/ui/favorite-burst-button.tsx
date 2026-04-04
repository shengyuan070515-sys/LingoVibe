import * as React from 'react';
import { motion } from 'framer-motion';
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

function ParticleBurst({ variant }: { variant: 'amber' | 'teal' }) {
    const tint = variant === 'teal' ? 'bg-teal-400/65' : 'bg-amber-400/70';
    const particles = React.useMemo(
        () =>
            Array.from({ length: 8 }, (_, i) => ({
                angle: (i / 8) * Math.PI * 2 + (Math.random() - 0.5) * 0.35,
                dist: 26 + Math.random() * 18,
                delay: i * 0.015,
                size: 4 + Math.random() * 3,
            })),
        []
    );

    return (
        <span className="pointer-events-none relative z-10 block h-px w-px shrink-0">
            {particles.map((p, i) => (
                <motion.span
                    key={i}
                    className={cn('absolute left-1/2 top-1/2 rounded-full', tint)}
                    style={{ width: p.size, height: p.size, marginLeft: -p.size / 2, marginTop: -p.size / 2 }}
                    initial={{ x: 0, y: 0, opacity: 0.9, scale: 1 }}
                    animate={{
                        x: Math.cos(p.angle) * p.dist,
                        y: Math.sin(p.angle) * p.dist,
                        opacity: 0,
                        scale: 0.2,
                    }}
                    transition={{ duration: 0.48, ease: [0.22, 1, 0.36, 1], delay: p.delay }}
                />
            ))}
        </span>
    );
}

/** 收藏星标：激活时弹簧 Pop + 半透明粒子 */
export function FavoriteStarBurstButton({
    active,
    onClick,
    className,
    title,
    starClassName,
    variant = 'amber',
}: {
    active: boolean;
    onClick: (e: React.MouseEvent) => void;
    className?: string;
    title?: string;
    starClassName?: string;
    variant?: 'amber' | 'teal';
}) {
    const isFirst = React.useRef(true);
    const prevActive = React.useRef(active);
    const [burstKey, setBurstKey] = React.useState(0);
    const [showBurst, setShowBurst] = React.useState(false);

    React.useEffect(() => {
        if (isFirst.current) {
            isFirst.current = false;
            prevActive.current = active;
            return;
        }
        if (active && !prevActive.current) {
            setBurstKey((k) => k + 1);
            setShowBurst(true);
            const t = window.setTimeout(() => setShowBurst(false), 520);
            prevActive.current = active;
            return () => window.clearTimeout(t);
        }
        prevActive.current = active;
    }, [active]);

    return (
        <motion.button
            type="button"
            title={title}
            className={cn('relative inline-flex min-h-8 min-w-8 items-center justify-center rounded-full', className)}
            onClick={onClick}
            whileTap={{ scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 520, damping: 28 }}
        >
            <span className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center">
                {showBurst ? <ParticleBurst key={burstKey} variant={variant} /> : null}
            </span>
            <motion.span
                className="relative z-[1] inline-flex"
                animate={
                    showBurst
                        ? { scale: [1, 1.28, 1], rotate: [0, -8, 6, 0] }
                        : { scale: 1, rotate: 0 }
                }
                transition={{ type: 'spring', stiffness: 400, damping: 14 }}
            >
                <Star
                    className={cn(
                        'h-5 w-5 transition-colors',
                        active
                            ? variant === 'teal'
                                ? 'fill-teal-500 text-teal-500'
                                : 'fill-amber-400 text-amber-500'
                            : 'text-slate-300',
                        starClassName
                    )}
                />
            </motion.span>
        </motion.button>
    );
}

/** 加入生词本按钮：burstKey 递增时从区域中心播放一次粒子 */
export function WordCollectParticleBurst({ burstKey }: { burstKey: number }) {
    if (burstKey <= 0) return null;
    return (
        <span className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center overflow-visible">
            <ParticleBurst key={burstKey} variant="teal" />
        </span>
    );
}
