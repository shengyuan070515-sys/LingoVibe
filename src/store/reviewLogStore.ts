import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export interface ReviewLogEntry {
    at: number;
    wordId: string;
    word: string;
    outcome: 'know' | 'forgot' | 'learning';
    levelBefore: number;
    levelAfter: number;
}

interface ReviewLogState {
    entries: ReviewLogEntry[];
    push: (e: Omit<ReviewLogEntry, 'at'> & { at?: number }) => void;
}

const MAX_ENTRIES = 600;

export const useReviewLogStore = create<ReviewLogState>()(
    persist(
        (set) => ({
            entries: [],
            push: (e) => {
                const row: ReviewLogEntry = { ...e, at: e.at ?? Date.now() };
                set((s) => ({ entries: [row, ...s.entries].slice(0, MAX_ENTRIES) }));
            },
        }),
        {
            name: 'lingovibe_review_log',
            version: 1,
            storage: createJSONStorage(() => localStorage),
        }
    )
);
