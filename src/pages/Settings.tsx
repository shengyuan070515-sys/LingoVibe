import * as React from 'react';
import { useLocalStorage } from "@/hooks/use-local-storage";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Save } from 'lucide-react';
import { useWordBankStore } from "@/store/wordBankStore";
import { testWordBankApiKey } from "@/lib/word-utils";

export function SettingsPage() {
    const [chatApiKey, setChatApiKey] = useLocalStorage('chat_api_key', '');
    const [podcastApiKey, setPodcastApiKey] = useLocalStorage('podcast_api_key', '');
    const [unsplashApiKey, setUnsplashApiKey] = useLocalStorage('unsplash_api_key', 'E40fl55KwMFbFkYW-yAaIxPbCAEur8W2MpQIDQm6ZT0');
    const [wordBankApiKey, setWordBankApiKey] = useLocalStorage('wordbank_api_key', '');
    const { refreshMissingDetails } = useWordBankStore();
    
    const [chatInput, setChatInput] = React.useState(chatApiKey);
    const [podcastInput, setPodcastInput] = React.useState(podcastApiKey);
    const [unsplashInput, setUnsplashInput] = React.useState(unsplashApiKey);
    const [wordBankKeyInput, setWordBankKeyInput] = React.useState(wordBankApiKey);
    
    const { toast } = useToast();

    const handleTestWordBankKey = async () => {
        const result = await testWordBankApiKey(wordBankKeyInput);
        if (result.ok) toast('生词本专属 Key 校验通过', 'success');
        else toast(`生词本专属 Key 校验失败：${result.message}`, 'error');
    };

    const handleSave = async () => {
        setChatApiKey(chatInput);
        setPodcastApiKey(podcastInput);
        setUnsplashApiKey(unsplashInput);
        setWordBankApiKey(wordBankKeyInput);
        toast('所有 API 密钥已成功保存!', 'success');

        // useLocalStorage 写入 localStorage 在 effect 里异步发生。
        // 生词本补全依赖 localStorage["wordbank_api_key"]，这里先同步落盘，避免用到旧 key。
        try {
            window.localStorage.setItem('wordbank_api_key', JSON.stringify(wordBankKeyInput.trim()));
        } catch {
            // ignore
        }

        const test = await testWordBankApiKey(wordBankKeyInput);
        if (!test.ok) {
            toast(`生词本补全已跳过：生词本专属 Key 无效（${test.message}）`, 'error');
            return;
        }

        // Key 通过才触发补全，避免无意义失败请求
        refreshMissingDetails();
    };

    return (
        <div className="space-y-6 max-w-4xl mx-auto">
            <Card className="border-none shadow-lg bg-white/80 backdrop-blur-md">
                <CardHeader>
                    <CardTitle className="text-xl font-bold flex items-center gap-2">
                        <Save className="h-5 w-5 text-blue-600" />
                        API 密钥管理
                    </CardTitle>
                    <CardDescription>
                        为了精细化控制成本与权限，请分别为不同模块配置专属的 API Key。
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="grid gap-6">
                        {/* Chat API Key */}
                        <div className="space-y-2">
                            <label htmlFor="chat-key" className="text-sm font-semibold text-gray-700">
                                AI 对话专属 Key (DeepSeek)
                            </label>
                            <input
                                id="chat-key"
                                type="password"
                                value={chatInput}
                                onChange={(e) => setChatInput(e.target.value)}
                                placeholder="sk-..."
                                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                            />
                        </div>

                        {/* Podcast API Key */}
                        <div className="space-y-2">
                            <label htmlFor="podcast-key" className="text-sm font-semibold text-gray-700">
                                每日播客专属 Key (DeepSeek)
                            </label>
                            <input
                                id="podcast-key"
                                type="password"
                                value={podcastInput}
                                onChange={(e) => setPodcastInput(e.target.value)}
                                placeholder="sk-..."
                                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                            />
                        </div>
                        
                        {/* Unsplash API Key */}
                        <div className="space-y-2">
                            <label htmlFor="unsplash-key" className="text-sm font-semibold text-gray-700 flex items-center justify-between">
                                视觉查词专属 Key (Unsplash)
                                <a href="https://unsplash.com/developers" target="_blank" rel="noreferrer" className="text-xs text-blue-500 hover:underline">获取密钥</a>
                            </label>
                            <input
                                id="unsplash-key"
                                type="password"
                                value={unsplashInput}
                                onChange={(e) => setUnsplashInput(e.target.value)}
                                placeholder="Access Key"
                                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                            />
                        </div>

                        <div className="space-y-2">
                            <label htmlFor="wordbank-key" className="text-sm font-semibold text-gray-700">
                                生词本专属 - API Key（可选）
                            </label>
                            <input
                                id="wordbank-key"
                                type="password"
                                value={wordBankKeyInput}
                                onChange={(e) => setWordBankKeyInput(e.target.value)}
                                placeholder="Bearer Token / sk-...（如需）"
                                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                            />
                            <div className="flex gap-2 pt-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="flex-1 rounded-xl"
                                    onClick={handleTestWordBankKey}
                                >
                                    测试生词本专属 Key
                                </Button>
                            </div>
                        </div>
                    </div>
                    
                    <Button onClick={handleSave} className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-md shadow-blue-200 transition-all active:scale-[0.98]">
                        <Save className="mr-2 h-4 w-4" />
                        保存所有配置
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
}
