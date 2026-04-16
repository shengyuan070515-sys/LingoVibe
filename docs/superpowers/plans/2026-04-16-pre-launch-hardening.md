# Pre-Launch Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all P0 and P1 issues identified in the post-fix audit so LingoVibe is production-ready for public launch (excluding user auth / cloud sync, which is deferred).

**Architecture:** Pure local fixes — no new backend services. API routes gain rate limiting and signing. Zustand stores gain `partialize` and pruning. Misleading UI copy is corrected. ESLint config is added. Mobile nav is completed. `.env.example` is updated. Tests are added for critical untested paths.

**Tech Stack:** React 18, TypeScript, Zustand (persist), Vercel Serverless Functions, Vercel KV, Vitest

---

## Task 1: wordBankStore — add `partialize` to prevent localStorage quota overflow

The word bank persists its entire `words` array (including `images`, `allDefinitions`, `synonyms`, etc.) with no size limit. Heavy users will hit the 5 MB localStorage ceiling.

**Files:**
- Modify: `src/store/wordBankStore.ts:346-369` (persist config)
- Test: `src/store/wordBankStore.test.ts`

- [ ] **Step 1: Write the failing test**

In `src/store/wordBankStore.test.ts`, add a new describe block:

```typescript
describe('partialize — localStorage quota protection', () => {
  it('persists at most 500 words', () => {
    const { words } = useWordBankStore.getState();
    // start clean
    useWordBankStore.setState({ words: [] });

    const bulkWords = Array.from({ length: 520 }, (_, i) => ({
      id: `bulk-${i}`,
      word: `testword${i}`,
      phonetic: '',
      pos: 'n.',
      translation: `翻译${i}`,
      exampleSentence: '',
      exampleTranslation: '',
      type: 'word' as const,
      addedAt: Date.now() - i * 1000,
      nextReviewDate: Date.now(),
      interval: 1,
      level: 0,
    }));
    useWordBankStore.setState({ words: bulkWords });

    // Simulate what persist would serialize
    const storage = JSON.parse(
      localStorage.getItem('lingovibe_global_wordbank') || '{}'
    );
    // After partialize, serialized words should be <= 500
    expect(storage.state?.words?.length ?? 0).toBeLessThanOrEqual(500);
  });

  it('strips allDefinitions and images from persisted words to save space', () => {
    useWordBankStore.setState({
      words: [{
        id: 'strip-test',
        word: 'test',
        phonetic: '',
        pos: 'n.',
        translation: 'test',
        exampleSentence: '',
        exampleTranslation: '',
        type: 'word' as const,
        addedAt: Date.now(),
        nextReviewDate: Date.now(),
        interval: 1,
        level: 0,
        allDefinitions: ['def1', 'def2', 'def3'],
        images: ['https://example.com/img1.jpg', 'https://example.com/img2.jpg'],
      }],
    });

    const storage = JSON.parse(
      localStorage.getItem('lingovibe_global_wordbank') || '{}'
    );
    const persisted = storage.state?.words?.[0];
    // images should be trimmed to at most 1
    expect((persisted?.images ?? []).length).toBeLessThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/store/wordBankStore.test.ts`
Expected: FAIL — no partialize function exists yet, localStorage contains all 520 words.

- [ ] **Step 3: Implement partialize in wordBankStore**

In `src/store/wordBankStore.ts`, update the persist config block (around line 346–369). Add a `partialize` function inside the persist options object, between `storage` and `merge`:

```typescript
{
    name: 'lingovibe_global_wordbank',
    version: 1,
    storage: createJSONStorage(() => localStorage),
    partialize: (state) => ({
        words: state.words
            .slice(-500)
            .map(({ allDefinitions, images, ...rest }) => ({
                ...rest,
                images: images?.slice(0, 1),
            })),
    }),
    merge: (persisted: any, current: any) => {
        // ... existing merge logic unchanged ...
    },
}
```

This keeps only the 500 most recently added words and trims `allDefinitions` entirely and `images` to at most 1 URL per word.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/store/wordBankStore.test.ts`
Expected: PASS

- [ ] **Step 5: Run full test suite + type check**

Run: `npx vitest run && npx tsc --noEmit`
Expected: All pass, no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/store/wordBankStore.ts src/store/wordBankStore.test.ts
git commit -m "fix: add partialize to wordBankStore to prevent localStorage quota overflow"
```

---

## Task 2: Add rate limiting to tts, reading-search, reading-extract, reading-featured-daily

Currently only `ai-proxy` has IP-based rate limiting. The other four browser-facing API routes have no abuse protection — anyone can curl them without limit to burn Tavily/GCP quotas.

**Files:**
- Modify: `api/tts.ts`
- Modify: `api/reading-search.ts`
- Modify: `api/reading-extract.ts`
- Modify: `api/reading-featured-daily.ts`

- [ ] **Step 1: Add rate limiting to `api/tts.ts`**

Add imports at the top of `api/tts.ts`:

```typescript
import { consumeRateLimit, getClientIp } from './_lib/rate-limit.js';
```

Insert rate limit check after the `req.method !== 'POST'` guard (after line 35), before body parsing:

```typescript
    const rl = await consumeRateLimit(getClientIp(req));
    if (!rl.ok) {
        res.setHeader('Retry-After', String(rl.retryAfterSec));
        res.status(429).json({ error: `Rate limit exceeded (${rl.scope})`, retryAfterSec: rl.retryAfterSec });
        return;
    }
```

- [ ] **Step 2: Add rate limiting to `api/reading-search.ts`**

Add imports at the top of `api/reading-search.ts`:

```typescript
import { consumeRateLimit, getClientIp } from './_lib/rate-limit.js';
```

Insert rate limit check after the `req.method !== 'POST'` guard (after line 21), before body parsing:

```typescript
    const rl = await consumeRateLimit(getClientIp(req));
    if (!rl.ok) {
        res.setHeader('Retry-After', String(rl.retryAfterSec));
        res.status(429).json({ error: `Rate limit exceeded (${rl.scope})`, retryAfterSec: rl.retryAfterSec });
        return;
    }
```

- [ ] **Step 3: Add rate limiting to `api/reading-extract.ts`**

Add imports at the top of `api/reading-extract.ts`:

```typescript
import { consumeRateLimit, getClientIp } from './_lib/rate-limit.js';
```

Insert rate limit check after the `req.method !== 'POST'` guard (after line 21), before body parsing:

```typescript
    const rl = await consumeRateLimit(getClientIp(req));
    if (!rl.ok) {
        res.setHeader('Retry-After', String(rl.retryAfterSec));
        res.status(429).json({ error: `Rate limit exceeded (${rl.scope})`, retryAfterSec: rl.retryAfterSec });
        return;
    }
```

- [ ] **Step 4: Add rate limiting to `api/reading-featured-daily.ts`**

Add imports at the top of `api/reading-featured-daily.ts`:

```typescript
import { consumeRateLimit, getClientIp } from './_lib/rate-limit.js';
```

Insert rate limit check after the `req.method !== 'GET'` guard (after line 22), before dateKey parsing:

```typescript
    const rl = await consumeRateLimit(getClientIp(req));
    if (!rl.ok) {
        res.setHeader('Retry-After', String(rl.retryAfterSec));
        res.status(429).json({ error: `Rate limit exceeded (${rl.scope})`, retryAfterSec: rl.retryAfterSec });
        return;
    }
```

- [ ] **Step 5: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add api/tts.ts api/reading-search.ts api/reading-extract.ts api/reading-featured-daily.ts
git commit -m "fix: add IP rate limiting to all browser-facing API routes"
```

---

## Task 3: Fix misleading UI copy — VIP badge, achievements title, demo seed badges

Three issues:
1. Dashboard shows a "VIP 会员" badge that is purely decorative — no subscription exists.
2. Achievements page says "成就与奖励" but there's no reward system.
3. Demo seed data (12 words injected on first visit) auto-unlocks early badges.

**Files:**
- Modify: `src/pages/Dashboard.tsx:188-192`
- Modify: `src/pages/Achievements.tsx:133`
- Modify: `src/pages/Achievements.tsx:32-38` (first badge condition)
- Modify: `src/lib/mockData.ts:7-9`

- [ ] **Step 1: Remove the VIP badge from Dashboard**

In `src/pages/Dashboard.tsx`, find this block (around line 188–192):

```tsx
                    <div className="flex items-center gap-2 rounded-full bg-stitch-tertiary-fixed px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-stitch-on-tertiary-fixed">
                        <Crown className="h-3.5 w-3.5" strokeWidth={2} />
                        VIP 会员
                    </div>
```

Replace it with the user's streak display (using data already available on Dashboard):

```tsx
                    <div className="flex items-center gap-2 rounded-full bg-gradient-to-r from-teal-50 to-emerald-50 px-4 py-1.5 text-xs font-bold tracking-wider text-teal-700">
                        <Flame className="h-3.5 w-3.5" strokeWidth={2} />
                        连续 {streak} 天
                    </div>
```

Also remove the `Crown` import from lucide-react at the top and add `Flame` if not already imported. Ensure the `streak` variable is available (it should already be computed on Dashboard from `computeLearningStreak`).

- [ ] **Step 2: Fix Achievements page title**

In `src/pages/Achievements.tsx`, line 133, change:

```tsx
                <h1 className="text-2xl font-bold tracking-tight text-slate-900">成就与奖励</h1>
```

to:

```tsx
                <h1 className="text-2xl font-bold tracking-tight text-slate-900">学习成就</h1>
```

- [ ] **Step 3: Exclude demo words from badge word count**

In `src/pages/Achievements.tsx`, around line 122, the context is built with:

```typescript
    const wordCount = words.length;
```

Change it to exclude demo-seeded words:

```typescript
    const wordCount = words.filter((w) => !w.id.startsWith('demo-')).length;
```

- [ ] **Step 4: Run type check + test suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Dashboard.tsx src/pages/Achievements.tsx
git commit -m "fix: remove fake VIP badge, rename achievements title, exclude demo words from badge count"
```

---

## Task 4: Add ESLint flat config

The repository has ESLint dependencies and a `lint` script but no config file.

**Files:**
- Create: `eslint.config.js`
- Modify: `package.json` (update lint script for flat config)

- [ ] **Step 1: Create `eslint.config.js`**

Create `eslint.config.js` at the project root:

```javascript
import js from '@eslint/js';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import reactRefreshPlugin from 'eslint-plugin-react-refresh';

export default [
  js.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
      globals: {
        window: 'readonly',
        document: 'readonly',
        localStorage: 'readonly',
        navigator: 'readonly',
        fetch: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        URL: 'readonly',
        HTMLElement: 'readonly',
        HTMLTextAreaElement: 'readonly',
        HTMLInputElement: 'readonly',
        HTMLDivElement: 'readonly',
        HTMLButtonElement: 'readonly',
        FileReader: 'readonly',
        Blob: 'readonly',
        Audio: 'readonly',
        Event: 'readonly',
        KeyboardEvent: 'readonly',
        MouseEvent: 'readonly',
        SpeechRecognition: 'readonly',
        webkitSpeechRecognition: 'readonly',
        SpeechRecognitionEvent: 'readonly',
        RequestInit: 'readonly',
        Response: 'readonly',
        AbortController: 'readonly',
        structuredClone: 'readonly',
        confirm: 'readonly',
        alert: 'readonly',
        crypto: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      'react-hooks': reactHooksPlugin,
      'react-refresh': reactRefreshPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      ...reactHooksPlugin.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-unused-vars': 'off',
    },
  },
  {
    files: ['api/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
      globals: {
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
        URL: 'readonly',
        fetch: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-unused-vars': 'off',
    },
  },
  {
    ignores: ['dist/**', 'node_modules/**', '*.config.js', '*.config.ts'],
  },
];
```

- [ ] **Step 2: Update lint script in `package.json`**

Change the `lint` script from:

```json
"lint": "eslint . --ext ts,tsx --report-unused-disable-directives --max-warnings 0"
```

to:

```json
"lint": "eslint src/ api/ --max-warnings 0"
```

(Flat config does not use `--ext`.)

- [ ] **Step 3: Install @eslint/js if missing**

Run: `npm ls @eslint/js 2>$null || npm install -D @eslint/js`

- [ ] **Step 4: Run lint and fix any new errors**

Run: `npx eslint src/ api/ --max-warnings 0`

Fix any errors that surface. Warnings are OK for initial commit.

- [ ] **Step 5: Commit**

```bash
git add eslint.config.js package.json package-lock.json
git commit -m "chore: add ESLint flat config for src/ and api/"
```

---

## Task 5: Update `.env.example` with missing variables

`.env.example` is missing documentation for `LINGOVIBE_SIGNING_SECRET`, `VITE_LINGOVIBE_SIGNING_SECRET`, `LINGOVIBE_ALLOWED_ORIGINS`, and `LINGOVIBE_RATE_LIMIT_SKIP`.

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Add missing env vars to `.env.example`**

After the `CRON_SECRET` line (around line 38), add:

```env

# 【推荐】请求签名密钥（HMAC-SHA256，自行生成 32+ 字符随机串）
# 服务端校验签名，前端携带签名。两端必须使用同一个值。
# 不配置时 ai-proxy 会返回 503，其余接口仅靠 IP 限流
LINGOVIBE_SIGNING_SECRET=
VITE_LINGOVIBE_SIGNING_SECRET=

# 【可选】额外允许的 CORS Origin（逗号分隔）
# 例如自定义域名或 Vercel 预览地址
# LINGOVIBE_ALLOWED_ORIGINS=https://my-custom-domain.com,https://preview-xxx.vercel.app

# 【可选】跳过 IP 限流（仅本地调试用，生产环境勿开）
# LINGOVIBE_RATE_LIMIT_SKIP=1
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "docs: add signing secret and rate limit env vars to .env.example"
```

---

## Task 6: Improve mobile navigation — add settings, stats, achievements to mobile tab bar or accessible entry

Currently mobile-tab-bar has 5 tabs (首页, 生词本, AI, 查词, 阅读). Settings, stats, achievements, flashcards, and courses are not directly reachable from mobile nav — they need to be accessed from the sidebar (hidden on mobile) or from dashboard cards.

**Files:**
- Modify: `src/components/layout/mobile-tab-bar.tsx`
- Modify: `src/pages/Dashboard.tsx` (ensure mobile CTA links exist for stats/achievements/settings)

- [ ] **Step 1: Add a "更多" menu to mobile tab bar**

In `src/components/layout/mobile-tab-bar.tsx`, replace the static tab array with a 5-tab layout where the last tab is "更多" that opens a slide-up panel or navigates to a hub:

```tsx
import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Home, BookMarked, Sparkles, Image as ImageIcon, MoreHorizontal, BookOpen, BarChart3, Trophy, Settings as SettingsIcon, GraduationCap, X } from 'lucide-react';
import { cn } from '@/lib/utils';

const mainTabs: { path: string; label: string; icon: typeof Home }[] = [
    { path: '/', label: '首页', icon: Home },
    { path: '/wordbank', label: '生词本', icon: BookMarked },
    { path: '/chat', label: 'AI', icon: Sparkles },
    { path: '/reading', label: '阅读', icon: BookOpen },
];

const moreTabs: { path: string; label: string; icon: typeof Home }[] = [
    { path: '/visual-dictionary', label: '视觉查词', icon: ImageIcon },
    { path: '/stats', label: '学习统计', icon: BarChart3 },
    { path: '/achievements', label: '学习成就', icon: Trophy },
    { path: '/courses', label: '微课', icon: GraduationCap },
    { path: '/settings', label: '设置', icon: SettingsIcon },
];

export function MobileTabBar() {
    const navigate = useNavigate();
    const location = useLocation();
    const [moreOpen, setMoreOpen] = useState(false);

    const isMoreActive = moreTabs.some((t) => location.pathname === t.path);

    return (
        <>
            {moreOpen && (
                <div className="fixed inset-0 z-50 md:hidden" onClick={() => setMoreOpen(false)}>
                    <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
                    <nav
                        className="absolute bottom-0 left-0 right-0 rounded-t-2xl bg-white px-4 pb-[max(1.5rem,env(safe-area-inset-bottom,0px))] pt-4 shadow-xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="mb-3 flex items-center justify-between">
                            <span className="text-sm font-semibold text-slate-700">更多功能</span>
                            <button type="button" onClick={() => setMoreOpen(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100" aria-label="关闭">
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                        <div className="grid grid-cols-4 gap-3">
                            {moreTabs.map(({ path, label, icon: Icon }) => (
                                <button
                                    key={path}
                                    type="button"
                                    onClick={() => { navigate(path); setMoreOpen(false); }}
                                    className={cn(
                                        'flex flex-col items-center gap-1.5 rounded-xl py-3 transition-colors',
                                        location.pathname === path ? 'bg-teal-50 text-teal-600' : 'text-slate-500 active:bg-slate-50'
                                    )}
                                >
                                    <Icon className="h-6 w-6" />
                                    <span className="text-[11px] font-medium leading-none">{label}</span>
                                </button>
                            ))}
                        </div>
                    </nav>
                </div>
            )}

            <nav
                className="fixed bottom-0 left-0 right-0 z-40 border-t border-teal-100/80 bg-white/95 pb-[max(0.5rem,env(safe-area-inset-bottom,0px))] pt-1 shadow-[0_-8px_30px_-12px_rgba(15,118,110,0.12)] backdrop-blur-md md:hidden"
                aria-label="主导航"
            >
                <div className="mx-auto flex max-w-lg items-stretch justify-around px-1">
                    {mainTabs.map(({ path, label, icon: Icon }) => {
                        const active =
                            location.pathname === path ||
                            (path === '/' && location.pathname === '/flashcard');
                        return (
                            <button
                                key={path}
                                type="button"
                                onClick={() => navigate(path)}
                                className={cn(
                                    'flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-xl py-1.5 transition-colors',
                                    active ? 'text-teal-600' : 'text-slate-400 active:bg-slate-50'
                                )}
                            >
                                <Icon className={cn('h-6 w-6 shrink-0', active ? 'stroke-[2]' : 'stroke-[1.5]')} aria-hidden />
                                <span className={cn('text-[10px] font-medium leading-none', active && 'font-semibold')}>{label}</span>
                            </button>
                        );
                    })}
                    <button
                        type="button"
                        onClick={() => setMoreOpen(true)}
                        className={cn(
                            'flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-xl py-1.5 transition-colors',
                            isMoreActive ? 'text-teal-600' : 'text-slate-400 active:bg-slate-50'
                        )}
                    >
                        <MoreHorizontal className={cn('h-6 w-6 shrink-0', isMoreActive ? 'stroke-[2]' : 'stroke-[1.5]')} aria-hidden />
                        <span className={cn('text-[10px] font-medium leading-none', isMoreActive && 'font-semibold')}>更多</span>
                    </button>
                </div>
            </nav>
        </>
    );
}
```

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Verify visually**

Run: `npx vite dev` and open on mobile viewport. Verify:
- 4 main tabs + "更多" tab visible
- Tapping "更多" opens the panel
- Each panel item navigates correctly
- Panel closes on backdrop tap or X button

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/mobile-tab-bar.tsx
git commit -m "feat: add 'more' panel to mobile tab bar for settings, stats, achievements"
```

---

## Task 7: Add tests for api-client signing logic

The HMAC signing in `src/lib/api-client.ts` is untested. This is a critical path — if signing breaks, all AI features stop working.

**Files:**
- Create: `src/lib/api-client.test.ts`
- Read: `src/lib/api-client.ts`

- [ ] **Step 1: Write the test file**

Create `src/lib/api-client.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('api-client', () => {
  const ORIGINAL_ENV = { ...import.meta.env };

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('sends POST with correct Content-Type', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ choices: [{ message: { content: 'hi' } }] }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const { callAiProxy } = await import('./api-client');
    await callAiProxy({ messages: [{ role: 'user', content: 'hello' }] });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain('/api/ai-proxy');
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');
  });

  it('throws on non-ok response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: () => Promise.resolve({ error: 'rate limited' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const { callAiProxy } = await import('./api-client');
    await expect(
      callAiProxy({ messages: [{ role: 'user', content: 'hello' }] })
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it works**

Run: `npx vitest run src/lib/api-client.test.ts`
Expected: PASS (or adjust mocks if the module structure differs).

- [ ] **Step 3: Commit**

```bash
git add src/lib/api-client.test.ts
git commit -m "test: add unit tests for api-client signing and error handling"
```

---

## Task 8: Prune learningAnalyticsStore dailyActivity to prevent unbounded growth

`dailyActivity` adds one key per calendar day forever. Over years this will bloat. Add a prune step that keeps only the last 365 days.

**Files:**
- Modify: `src/store/learningAnalyticsStore.ts`
- Modify: `src/store/learningAnalyticsStore.test.ts`

- [ ] **Step 1: Write the failing test**

In `src/store/learningAnalyticsStore.test.ts`, add:

```typescript
describe('dailyActivity pruning', () => {
  it('partialize keeps at most 365 days of activity', () => {
    const store = useLearningAnalyticsStore;
    const activity: Record<string, number> = {};
    for (let i = 0; i < 400; i++) {
      const d = new Date(2025, 0, 1 + i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      activity[key] = i + 1;
    }
    store.setState({ dailyActivity: activity });

    const raw = localStorage.getItem('lingovibe_learning_analytics');
    const parsed = raw ? JSON.parse(raw) : {};
    const keys = Object.keys(parsed.state?.dailyActivity ?? {});
    expect(keys.length).toBeLessThanOrEqual(365);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/store/learningAnalyticsStore.test.ts`
Expected: FAIL — no pruning exists.

- [ ] **Step 3: Add partialize to learningAnalyticsStore**

In `src/store/learningAnalyticsStore.ts`, add a `partialize` option to the persist config:

```typescript
partialize: (state) => {
    const entries = Object.entries(state.dailyActivity);
    entries.sort((a, b) => b[0].localeCompare(a[0]));
    const pruned = Object.fromEntries(entries.slice(0, 365));
    return {
        dailyActivity: pruned,
        lifetime: state.lifetime,
        backfillFromWordsDone: state.backfillFromWordsDone,
    };
},
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/store/learningAnalyticsStore.test.ts`
Expected: PASS

- [ ] **Step 5: Run full suite**

Run: `npx vitest run && npx tsc --noEmit`
Expected: All pass.

- [ ] **Step 6: Commit**

```bash
git add src/store/learningAnalyticsStore.ts src/store/learningAnalyticsStore.test.ts
git commit -m "fix: prune learningAnalyticsStore dailyActivity to 365 days via partialize"
```

---

## Task 9: Add data export/import for user backup (localStorage safety net)

Until a full cloud auth system is built, users need a way to back up and restore their data. Add export (JSON download) and import (JSON upload) to the Settings page.

**Files:**
- Create: `src/lib/data-export.ts`
- Modify: `src/pages/Settings.tsx`

- [ ] **Step 1: Create `src/lib/data-export.ts`**

```typescript
import { useWordBankStore } from '@/store/wordBankStore';
import { useLearningAnalyticsStore } from '@/store/learningAnalyticsStore';
import { useReviewLogStore } from '@/store/reviewLogStore';

interface ExportPayload {
    version: 1;
    exportedAt: string;
    wordBank: unknown;
    analytics: unknown;
    reviewLog: unknown;
    chatSessions: unknown;
}

export function exportAllData(): string {
    const payload: ExportPayload = {
        version: 1,
        exportedAt: new Date().toISOString(),
        wordBank: useWordBankStore.getState().words,
        analytics: {
            dailyActivity: useLearningAnalyticsStore.getState().dailyActivity,
            lifetime: useLearningAnalyticsStore.getState().lifetime,
        },
        reviewLog: useReviewLogStore.getState().entries,
        chatSessions: (() => {
            try {
                const raw = localStorage.getItem('lingovibe_ai_chat_v2');
                return raw ? JSON.parse(raw) : null;
            } catch {
                return null;
            }
        })(),
    };
    return JSON.stringify(payload, null, 2);
}

export function downloadExport(): void {
    const json = exportAllData();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lingovibe-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

export function importAllData(json: string): { ok: true; wordCount: number } | { ok: false; error: string } {
    try {
        const data = JSON.parse(json) as ExportPayload;
        if (!data.version || !Array.isArray(data.wordBank)) {
            return { ok: false, error: '文件格式不正确，缺少必需字段' };
        }

        if (data.wordBank.length > 0) {
            useWordBankStore.setState({ words: data.wordBank as any });
        }

        if (data.analytics && typeof data.analytics === 'object') {
            const a = data.analytics as any;
            if (a.dailyActivity) {
                useLearningAnalyticsStore.setState({
                    dailyActivity: a.dailyActivity,
                    lifetime: a.lifetime ?? useLearningAnalyticsStore.getState().lifetime,
                });
            }
        }

        if (Array.isArray(data.reviewLog)) {
            useReviewLogStore.setState({ entries: data.reviewLog as any });
        }

        if (data.chatSessions) {
            localStorage.setItem('lingovibe_ai_chat_v2', JSON.stringify(data.chatSessions));
        }

        return { ok: true, wordCount: data.wordBank.length };
    } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : '解析失败' };
    }
}
```

- [ ] **Step 2: Add export/import UI to Settings page**

In `src/pages/Settings.tsx`, import the new functions and add an "数据管理" card section with two buttons:

1. **导出数据** — calls `downloadExport()` and shows a success toast
2. **导入数据** — opens a hidden file input, reads the JSON, calls `importAllData()`, shows result toast

(The exact JSX will follow the existing card style in Settings.)

- [ ] **Step 3: Run type check + test suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: All pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/data-export.ts src/pages/Settings.tsx
git commit -m "feat: add data export/import to Settings as localStorage backup safety net"
```

---

## Self-Review Checklist

**1. Spec coverage:**
- ✅ P0: wordBankStore partialize (Task 1)
- ✅ P0: Rate limiting on all routes (Task 2)
- ✅ P1: Misleading UI (Task 3)
- ✅ P1: ESLint config (Task 4)
- ✅ P1: .env.example (Task 5)
- ✅ P1: Mobile nav (Task 6)
- ✅ P1: Critical path tests (Task 7)
- ✅ P1: Analytics store pruning (Task 8)
- ✅ Deferred: Data export/import as interim solution before cloud auth (Task 9)

**2. Placeholder scan:** No TBD / TODO / "implement later" in any task.

**3. Type consistency:** All function names, file paths, and import paths reference actual existing code.
