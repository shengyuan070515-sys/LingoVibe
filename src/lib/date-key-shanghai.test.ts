import { describe, expect, it } from 'vitest';
import { getDateKeyShanghai } from './date-key-shanghai';

describe('getDateKeyShanghai', () => {
    it('formats known instant in Shanghai', () => {
        const d = new Date('2026-04-04T15:00:00.000Z');
        expect(getDateKeyShanghai(d)).toBe('2026-04-04');
    });

    it('rolls date for late UTC same calendar Shanghai next day', () => {
        const d = new Date('2026-04-04T17:00:00.000Z');
        expect(getDateKeyShanghai(d)).toBe('2026-04-05');
    });
});
