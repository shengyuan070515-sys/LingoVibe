import { History, Trash2, Clock, Book, X } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { useWordBankStore } from "@/store/wordBankStore";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

export interface SearchHistoryItem {
    id: string;
    query: string;
    timestamp: number;
    result?: any; 
}

interface SearchHistorySidebarProps {
    history: SearchHistoryItem[];
    onSelectHistory: (query: string) => void;
    onDeleteHistory: (id: string) => void;
    onClearAll: () => void;
    /** 移动端抽屉：关闭 */
    onClose?: () => void;
    className?: string;
}

export function SearchHistorySidebar({ 
    history, 
    onSelectHistory, 
    onDeleteHistory, 
    onClearAll,
    onClose,
    className,
}: SearchHistorySidebarProps) {
    const { addWord } = useWordBankStore();
    const { toast } = useToast();

    // 【核心修复点】切除所有 try...catch 报错拦截，直接无脑发给仓库 + 瞬间弹绿色的成功提示！
    const handleAddToWordBank = (query: string) => {
        // 直接调用仓库，不需要 await 等待，让仓库自己去后台慢慢查
        addWord({ word: query, type: 'word' });
        // 瞬间弹绿色的成功提示，主打一个丝滑！
        toast(`"${query}" 已添加到生词本`, "success");
    };

    const formatTime = (timestamp: number) => {
        const now = Date.now();
        const diff = now - timestamp;
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);

        if (minutes < 1) return '刚刚';
        if (minutes < 60) return `${minutes}分钟前`;
        if (hours < 24) return `${hours}小时前`;
        if (days < 7) return `${days}天前`;
        
        return new Date(timestamp).toLocaleDateString();
    };

    return (
        <div className={cn('flex h-full w-full flex-col border-gray-200 bg-gray-50 md:w-80 md:border-r', className)}>
            {/* Header */}
            <div className="border-b border-gray-200 p-4">
                <div className="mb-4 flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                        <History className="h-5 w-5 shrink-0 text-gray-600" />
                        <h2 className="font-semibold text-gray-800">搜索历史</h2>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                        {history.length > 0 && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={onClearAll}
                                className="text-gray-400 hover:text-red-500"
                            >
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        )}
                        {onClose && (
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-9 w-9 md:hidden"
                                onClick={onClose}
                                aria-label="关闭"
                            >
                                <X className="h-5 w-5" />
                            </Button>
                        )}
                    </div>
                </div>
                
                {history.length === 0 && (
                    <div className="text-center py-8">
                        <Clock className="h-12 w-12 text-gray-300 mx-auto mb-2" />
                        <p className="text-sm text-gray-500">暂无搜索记录</p>
                    </div>
                )}
            </div>

            {/* History List */}
            <div className="flex-1 overflow-y-auto">
                <div className="p-2 space-y-1">
                    {history.map((item) => (
                        <div
                            key={item.id}
                            className="group relative p-3 rounded-lg hover:bg-white transition-colors cursor-pointer border border-transparent hover:border-gray-200"
                            onClick={() => onSelectHistory(item.query)}
                        >
                            <div className="flex items-start justify-between">
                                <div className="flex-1 min-w-0">
                                    <h3 className="font-medium text-gray-900 text-sm truncate">
                                        {item.query}
                                    </h3>
                                    <p className="text-xs text-gray-500 mt-1">
                                        {formatTime(item.timestamp)}
                                    </p>
                                </div>
                                
                                <div className="flex items-center gap-1 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleAddToWordBank(item.query);
                                        }}
                                        className="h-6 w-6 p-0 text-gray-400 hover:text-blue-600"
                                    >
                                        <Book className="h-3 w-3" />
                                    </Button>
                                    
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onDeleteHistory(item.id);
                                        }}
                                        className="h-6 w-6 p-0 text-gray-400 hover:text-red-500"
                                    >
                                        <Trash2 className="h-3 w-3" />
                                    </Button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Footer */}
            <div className="p-3 border-t border-gray-200 bg-gray-50">
                <p className="text-xs text-gray-500 text-center">
                    共 {history.length} 条搜索记录
                </p>
            </div>
        </div>
    );
}