import type { WordBankItem } from '@/store/wordBankStore';
import { useWordBankStore } from '@/store/wordBankStore';

const U = (id: string, w = 800) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=80`;

/** 12 条高质量演示生词，含真实 Unsplash 配图 */
export const MOCK_WORD_BANK_ITEMS: WordBankItem[] = (() => {
    const base = Date.now();
    const tier = (i: number) => ({
        addedAt: base - i * 3_600_000,
        nextReviewDate: base - i * 86_400_000,
        interval: 1 + (i % 4),
        level: i % 5,
    });
    const items: Omit<WordBankItem, 'addedAt' | 'nextReviewDate' | 'interval' | 'level'>[] = [
        {
            id: 'demo-serendipity',
            word: 'serendipity',
            phonetic: '/ˌserənˈdɪpəti/',
            pos: 'n.',
            translation: '意外发现美好事物的机缘',
            exampleSentence: 'Finding this quiet café was pure serendipity.',
            exampleTranslation: '发现这家安静的小咖啡馆纯属意外之喜。',
            type: 'word',
            images: [U('photo-1506905925346-21bda4d32df4')],
            synonyms: ['luck', 'fortune'],
        },
        {
            id: 'demo-ephemeral',
            word: 'ephemeral',
            phonetic: '/ɪˈfemərəl/',
            pos: 'adj.',
            translation: '短暂的；朝生暮死的',
            exampleSentence: 'Cherry blossoms are beautiful because they are ephemeral.',
            exampleTranslation: '樱花之美，正在于它的短暂。',
            type: 'word',
            images: [U('photo-1522383225653-ed111181a951')],
            synonyms: ['fleeting', 'transient'],
        },
        {
            id: 'demo-resonate',
            word: 'resonate',
            phonetic: '/ˈrezəneɪt/',
            pos: 'v.',
            translation: '产生共鸣；回响',
            exampleSentence: 'Her story resonated with everyone in the room.',
            exampleTranslation: '她的故事引起了在场每个人的共鸣。',
            type: 'word',
            images: [U('photo-1470225620780-dba8ba36b745')],
            synonyms: ['echo', 'strike a chord'],
        },
        {
            id: 'demo-meticulous',
            word: 'meticulous',
            phonetic: '/məˈtɪkjələs/',
            pos: 'adj.',
            translation: '一丝不苟的；严谨的',
            exampleSentence: 'He keeps meticulous notes from every meeting.',
            exampleTranslation: '他对每场会议都做了极其细致的记录。',
            type: 'word',
            images: [U('photo-1454165804606-c3d57bc86b40')],
            synonyms: ['careful', 'precise'],
        },
        {
            id: 'demo-wanderlust',
            word: 'wanderlust',
            phonetic: '/ˈwɒndəlʌst/',
            pos: 'n.',
            translation: '旅行热；漫游癖',
            exampleSentence: 'A cheap flight awakened her wanderlust again.',
            exampleTranslation: '一张特价机票又勾起了她的旅行欲。',
            type: 'word',
            images: [U('photo-1488646953014-85cb44e25828')],
            synonyms: ['urge to travel', 'restlessness'],
        },
        {
            id: 'demo-eloquent',
            word: 'eloquent',
            phonetic: '/ˈeləkwənt/',
            pos: 'adj.',
            translation: '雄辩的；有说服力的',
            exampleSentence: 'She gave an eloquent speech without notes.',
            exampleTranslation: '她脱稿做了一场极富感染力的演讲。',
            type: 'word',
            images: [U('photo-1512820790803-83ca734da794')],
            synonyms: ['articulate', 'fluent'],
        },
        {
            id: 'demo-nostalgia',
            word: 'nostalgia',
            phonetic: '/nɒˈstældʒə/',
            pos: 'n.',
            translation: '怀旧；乡愁',
            exampleSentence: 'Old songs filled him with gentle nostalgia.',
            exampleTranslation: '老歌让他泛起温柔的怀旧之情。',
            type: 'word',
            images: [U('photo-1516979187457-637b4c1e3b3a')],
            synonyms: ['longing', 'reminiscence'],
        },
        {
            id: 'demo-vibrant',
            word: 'vibrant',
            phonetic: '/ˈvaɪbrənt/',
            pos: 'adj.',
            translation: '充满活力的；鲜艳的',
            exampleSentence: 'The market was vibrant with color and music.',
            exampleTranslation: '市场里色彩与音乐交织，生机勃勃。',
            type: 'word',
            images: [U('photo-1555939594-58d7cb561ad1')],
            synonyms: ['lively', 'bright'],
        },
        {
            id: 'demo-solitude',
            word: 'solitude',
            phonetic: '/ˈsɒlɪtjuːd/',
            pos: 'n.',
            translation: '独处；孤寂',
            exampleSentence: 'He enjoys an hour of solitude before dawn.',
            exampleTranslation: '他喜欢黎明前独处的这一小时。',
            type: 'word',
            images: [U('photo-1507525428034-b723cf961d3e')],
            synonyms: ['aloneness', 'quiet'],
        },
        {
            id: 'demo-cherish',
            word: 'cherish',
            phonetic: '/ˈtʃerɪʃ/',
            pos: 'v.',
            translation: '珍爱；怀有（感情）',
            exampleSentence: 'Cherish small wins; they add up.',
            exampleTranslation: '珍惜每一个小胜利，它们会积少成多。',
            type: 'word',
            images: [U('photo-1518199266791-5375a90c90dd')],
            synonyms: ['treasure', 'value'],
        },
        {
            id: 'demo-alleviate',
            word: 'alleviate',
            phonetic: '/əˈliːvieɪt/',
            pos: 'v.',
            translation: '减轻；缓和',
            exampleSentence: 'Tea helped alleviate her headache.',
            exampleTranslation: '喝茶让她的头痛减轻了一些。',
            type: 'word',
            images: [U('photo-1544787219-7f47ccb65c58')],
            synonyms: ['ease', 'relieve'],
        },
        {
            id: 'demo-aroma',
            word: 'aroma',
            phonetic: '/əˈrəʊmə/',
            pos: 'n.',
            translation: '芳香；气味',
            exampleSentence: 'The aroma of fresh bread drifted down the street.',
            exampleTranslation: '新鲜面包的香气飘到了街上。',
            type: 'word',
            images: [U('photo-1497935586351-b67a49e012bf')],
            synonyms: ['scent', 'fragrance'],
        },
    ];
    return items.map((raw, i) => ({ ...raw, ...tier(i) })) as WordBankItem[];
})();

/** 首次打开且本地无数据时注入演示内容，不覆盖已有学习数据 */
export function seedDemoDataIfEmpty(): void {
    const words = useWordBankStore.getState().words;
    if (!Array.isArray(words) || words.length === 0) {
        useWordBankStore.setState({ words: [...MOCK_WORD_BANK_ITEMS] });
    }
}
