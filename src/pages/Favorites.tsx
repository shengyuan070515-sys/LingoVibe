import * as React from 'react';
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Trash2, Bookmark, Book, MessageSquare, ChevronDown, ChevronUp, Quote, Lightbulb, Volume2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useWordBankStore, WordBankItem } from "@/store/wordBankStore";

export function FavoritesPage() {
    const { words, removeWord } = useWordBankStore();
    const [view, setView] = React.useState<'sentences' | 'words'>('words');
    const [expandedId, setExpandedId] = React.useState<string | null>(null);
    const { toast } = useToast();

    // 语音朗读功能
    const playAudio = (e: React.MouseEvent, text: string) => {
        if (e) e.stopPropagation();
        const utterance = new SpeechSynthesisUtterance(text);
        const voices = window.speechSynthesis.getVoices();
        // 尝试寻找一个稳定的美式英语发音
        const englishVoice = voices.find(v => v.lang === 'en-US' && (v.name.includes('Google') || v.name.includes('Samantha') || v.name.includes('Microsoft'))) || voices.find(v => v.lang.startsWith('en'));
        if (englishVoice) utterance.voice = englishVoice;
        utterance.lang = 'en-US';
        window.speechSynthesis.speak(utterance);
    };

    // 安全过滤，防止 words 不是数组或 item 为空
    const safeFavorites = React.useMemo(() => {
        if (!Array.isArray(words)) return [];
        return words.filter((item) => item && typeof item === 'object' && item.word);
    }, [words]);

    const sentences = safeFavorites.filter(fav => fav.type === 'sentence');
    const wordsList = safeFavorites.filter(fav => fav.type === 'word');

    const itemsToDisplay = view === 'sentences' ? sentences : wordsList;

    const formatDate = (dateInput: any) => {
        if (!dateInput) return "未知日期";
        try {
            const date = new Date(dateInput);
            if (isNaN(date.getTime())) return "未知日期";
            // 简单的 YYYY-MM-DD 格式
            return date.toISOString().split('T')[0];
        } catch (e) {
            return "未知日期";
        }
    };

    const handleRemove = (e: React.MouseEvent, itemToRemove: WordBankItem) => {
        e.stopPropagation();
        removeWord(itemToRemove.id);
        toast("已从收藏中移除", "default");
    };

    const toggleExpand = (id: string) => {
        setExpandedId(expandedId === id ? null : id);
    };

    // 补全旧数据
    const handleRepairItem = async (e: React.MouseEvent) => {
        e.stopPropagation();
        toast("正在尝试重新补全信息...", "default");
        toast("建议在 AI 对话中重新划词收藏以获取完整信息", "default");
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold">我的收藏</h1>
                <div className="p-1 bg-gray-100 rounded-lg flex gap-1">
                    <Button 
                        size="sm"
                        variant={view === 'words' ? 'default' : 'ghost'}
                        onClick={() => setView('words')}
                        className="text-xs"
                    >
                        <Book className="h-4 w-4 mr-1.5" />
                        单词本 ({wordsList.length})
                    </Button>
                    <Button 
                        size="sm"
                        variant={view === 'sentences' ? 'default' : 'ghost'}
                        onClick={() => setView('sentences')}
                        className="text-xs"
                    >
                        <MessageSquare className="h-4 w-4 mr-1.5" />
                        句子库 ({sentences.length})
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {itemsToDisplay.length > 0 ? (
                    itemsToDisplay.map((item, index) => {
                        // 确保 item 存在
                        if (!item) return null;
                        
                        const itemId = item.id || `${item.word}-${item.addedAt || index}`;
                        const isExpanded = expandedId === itemId;
                        const isLegacy = item.type === 'word' && (!item.translation || item.translation === '点击展开手动补全');

                        return (
                            <Card 
                                key={itemId} 
                                className={cn(
                                    "transition-all duration-300 hover:shadow-md cursor-pointer overflow-hidden border-l-4",
                                    item.type === 'word' ? "border-l-blue-500 bg-white" : "border-l-purple-500 bg-purple-50/10",
                                    isExpanded ? "md:col-span-2 shadow-xl border-blue-200" : "border-transparent"
                                )}
                                onClick={() => toggleExpand(itemId)}
                            >
                                <CardContent className="p-5">
                                    <div className="flex justify-between items-start">
                                        <div className="space-y-1.5 flex-1">
                                            <div className="flex items-center gap-3">
                                                <h3 className="text-xl font-bold text-gray-900 tracking-tight">{item?.word}</h3>
                                                {item?.type === 'word' && (
                                                    <div className="flex items-center gap-2">
                                                        {item?.phonetic && (
                                                            <span className="text-gray-400 text-sm font-normal ml-1">/{item.phonetic.replace(/\//g, '')}/</span>
                                                        )}
                                                        <button 
                                                            onClick={(e) => playAudio(e, item.word)}
                                                            className="p-1 rounded-full hover:bg-blue-50 text-blue-400 hover:text-blue-600 transition-colors"
                                                            title="播放发音"
                                                        >
                                                            <Volume2 className="h-4 w-4" />
                                                        </button>
                                                    </div>
                                                )}
                                                {item?.pos && item?.pos !== 'unknown' && (
                                                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-bold uppercase">
                                                        {item.pos}
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-sm font-semibold text-blue-600/90">
                                                {item?.translation || (item?.type === 'sentence' ? '句子收藏' : '信息获取中...')}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <Button 
                                                variant="ghost" 
                                                size="icon" 
                                                className="h-8 w-8 text-gray-400 hover:text-red-500 hover:bg-red-50"
                                                onClick={(e) => handleRemove(e, item)}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                            <div className="text-gray-300">
                                                {isExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                                            </div>
                                        </div>
                                    </div>

                                    {isExpanded && (
                                        <div className="mt-6 pt-6 border-t border-gray-100 space-y-6 animate-in fade-in slide-in-from-top-2">
                                            {item?.type === 'word' && (
                                                <>
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                        <div className="space-y-2">
                                                            <div className="flex items-center gap-2 text-[10px] font-bold text-blue-400 uppercase tracking-widest">
                                                                <Lightbulb className="h-3 w-3" /> 智能例句 Example
                                                            </div>
                                                            <div className="text-sm text-gray-700 bg-blue-50/40 p-4 rounded-2xl italic leading-relaxed border border-blue-100/50 shadow-sm">
                                                                "{item?.exampleSentence || '暂无 AI 生成例句'}"
                                                            </div>
                                                        </div>
                                                        <div className="space-y-2">
                                                            <div className="flex items-center gap-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                                                                <Quote className="h-3 w-3" /> 来源语境 Context
                                                            </div>
                                                            <div className="text-sm text-gray-600 bg-gray-50 p-4 rounded-2xl leading-relaxed border border-gray-100 shadow-sm">
                                                                ...{item?.context || '未捕获到上下文'}...
                                                            </div>
                                                        </div>
                                                    </div>
                                                    
                                                    {isLegacy && (
                                                        <Button 
                                                            variant="outline" 
                                                            size="sm" 
                                                            className="w-full border-dashed text-gray-400 text-xs"
                                                            onClick={(e) => handleRepairItem(e)}
                                                        >
                                                            发现旧数据：点击尝试补全（开发中）
                                                        </Button>
                                                    )}
                                                </>
                                            )}

                                            <div className="flex justify-between items-center pt-2">
                                                <div className="flex gap-2">
                                                    <span className="px-2 py-1 rounded-md bg-gray-100 text-[10px] text-gray-500 font-medium">
                                                        ID: {item?.id ? item.id.slice(-6) : 'N/A'}
                                                    </span>
                                                    <span className="px-2 py-1 rounded-md bg-indigo-50 text-[10px] text-indigo-500 font-bold">
                                                        Lv.{item?.level || 0}
                                                    </span>
                                                </div>
                                                <div className="text-[10px] text-gray-400 font-medium">
                                                    收藏于 {formatDate(item?.addedAt)}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        );
                    })
                ) : (
                    <div className="col-span-full text-center py-24 bg-white rounded-3xl border-2 border-dashed border-gray-100 shadow-inner">
                        <div className="bg-gray-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Bookmark className="h-10 w-10 text-gray-200" />
                        </div>
                        <p className="font-bold text-gray-500 text-lg">开启你的单词探索</p>
                        <p className="text-sm text-gray-400 mt-2 max-w-xs mx-auto">
                            在 AI 对话中划词收藏，Emma 将为你自动生成完整的智能单词卡片。
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
