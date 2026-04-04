/** 情景微课 Step2 · 词汇硬门槛（仅统计用户消息） */

export type LexiconCoverage = {
    iced: boolean;
    oatMilk: boolean;
    alternative: boolean;
};

export type LexiconProgressPayload = {
    coverage: LexiconCoverage;
    complete: boolean;
};

/** 累计用户发言是否已覆盖 iced / oat milk / alternative */
export function evaluateLexiconCoverage(userTexts: string[]): LexiconCoverage {
    const hit: LexiconCoverage = { iced: false, oatMilk: false, alternative: false };
    for (const raw of userTexts) {
        const t = raw.trim();
        if (!t) continue;

        if (!hit.iced && /\biced\b/i.test(t)) hit.iced = true;
        if (!hit.alternative && /\balternative\b/i.test(t)) hit.alternative = true;

        if (!hit.oatMilk) {
            if (/oat\s+milk/i.test(t)) hit.oatMilk = true;
            else if (/\boat\b\s+\bmilk\b/i.test(t)) hit.oatMilk = true;
        }
    }
    return hit;
}

export function isLexiconMissionComplete(coverage: LexiconCoverage): boolean {
    return coverage.iced && coverage.oatMilk && coverage.alternative;
}

export function missingLexiconLabels(coverage: LexiconCoverage): string[] {
    const out: string[] = [];
    if (!coverage.iced) out.push('iced');
    if (!coverage.oatMilk) out.push('oat milk');
    if (!coverage.alternative) out.push('alternative');
    return out;
}
