/** 情景微课 · 咖啡店点单（纯前端演示） */

export const MICRO_LESSON_TITLE = '咖啡店点单 · 输入—输出闭环';

/** Emma 开场白（与微课对话初始 assistant 消息一致） */
export const MICRO_LESSON_OPENING_LINE = 'Hi there! What can I get started for you today?';

export const TARGET_LEXEMES = ['iced', 'oat milk', 'alternative'] as const;

export type DialoguePart = { text: string; highlight?: boolean };

export type DialogueLine = {
    id: string;
    role: 'customer' | 'barista';
    roleLabel: string;
    parts: DialoguePart[];
};

export const MOCK_DIALOGUE: DialogueLine[] = [
    {
        id: '1',
        role: 'customer',
        roleLabel: '顾客',
        parts: [
            { text: 'Hi! Could I get a ' },
            { text: 'large latte', highlight: false },
            { text: ' with ' },
            { text: 'oat milk', highlight: true },
            { text: ', please — ' },
            { text: 'iced', highlight: true },
            { text: ', not hot.' },
        ],
    },
    {
        id: '2',
        role: 'barista',
        roleLabel: '店员',
        parts: [
            { text: 'Of course. We offer ' },
            { text: 'oat milk', highlight: true },
            { text: ' as an ' },
            { text: 'alternative', highlight: true },
            { text: ' to regular dairy. Still want it ' },
            { text: 'iced', highlight: true },
            { text: '?' },
        ],
    },
    {
        id: '3',
        role: 'customer',
        roleLabel: '顾客',
        parts: [
            { text: 'Yes, ' },
            { text: 'iced', highlight: true },
            { text: ' is perfect. That’s all — thanks!' },
        ],
    },
];

export const MISSION_COPY =
    '扮演顾客向 AI 店员点单，必须使用上述 3 个词：在一句或两句英文里自然说出 iced、oat milk、alternative。';
