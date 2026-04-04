import * as React from 'react';
import { useLocalStorage, emitLocalStorageSync } from "@/hooks/use-local-storage";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Save, UserRound } from 'lucide-react';
import { useWordBankStore } from "@/store/wordBankStore";
import { testWordBankApiKey } from "@/lib/word-utils";

export function SettingsPage() {
    const [chatApiKey, setChatApiKey] = useLocalStorage('chat_api_key', '');
    const [readingApiKey, setReadingApiKey] = useLocalStorage('reading_api_key', '');
    const [readingSearchApiKey, setReadingSearchApiKey] = useLocalStorage('reading_search_api_key', '');
    const [unsplashApiKey, setUnsplashApiKey] = useLocalStorage('unsplash_api_key', 'E40fl55KwMFbFkYW-yAaIxPbCAEur8W2MpQIDQm6ZT0');
    const [wordBankApiKey, setWordBankApiKey] = useLocalStorage('wordbank_api_key', '');
    const [displayName, setDisplayName] = useLocalStorage('lingovibe_display_name', '');
    const { refreshMissingDetails } = useWordBankStore();
    
    const [chatInput, setChatInput] = React.useState(chatApiKey);
    const [readingInput, setReadingInput] = React.useState(readingApiKey);
    const [readingSearchInput, setReadingSearchInput] = React.useState(readingSearchApiKey);
    const [unsplashInput, setUnsplashInput] = React.useState(unsplashApiKey);
    const [wordBankKeyInput, setWordBankKeyInput] = React.useState(wordBankApiKey);
    const [displayNameInput, setDisplayNameInput] = React.useState(displayName);

    React.useEffect(() => {
        setDisplayNameInput(displayName);
    }, [displayName]);

    React.useEffect(() => {
        setChatInput(chatApiKey);
    }, [chatApiKey]);
    React.useEffect(() => {
        setReadingInput(readingApiKey);
    }, [readingApiKey]);
    React.useEffect(() => {
        setReadingSearchInput(readingSearchApiKey);
    }, [readingSearchApiKey]);
    React.useEffect(() => {
        setUnsplashInput(unsplashApiKey);
    }, [unsplashApiKey]);
    React.useEffect(() => {
        setWordBankKeyInput(wordBankApiKey);
    }, [wordBankApiKey]);
    
    const { toast } = useToast();

    const handleTestWordBankKey = async () => {
        const result = await testWordBankApiKey(wordBankKeyInput);
        if (result.ok) toast('生词本专属 Key 校验通过', 'success');
        else toast(`生词本专属 Key 校验失败：${result.message}`, 'error');
    };

    const handleSave = async () => {
        setChatApiKey(chatInput);
        setReadingApiKey(readingInput);
        setReadingSearchApiKey(readingSearchInput);
        setUnsplashApiKey(unsplashInput);
        setWordBankApiKey(wordBankKeyInput);
        toast('所有 API 密钥已成功保存!', 'success');

        try {
            window.localStorage.setItem('wordbank_api_key', JSON.stringify(wordBankKeyInput.trim()));
            emitLocalStorageSync('wordbank_api_key');
        } catch {
            /* ignore */
        }

        const test = await testWordBankApiKey(wordBankKeyInput);
        if (!test.ok) {
            toast(`生词本补全已跳过：生词本专属 Key 无效（${test.message}）`, 'error');
            return;
        }

        refreshMissingDetails();
    };

    return (
        <div className="space-y-6 max-w-4xl mx-auto">
            <Card className="border-none shadow-lg bg-white/80 backdrop-blur-md">
                <CardHeader>
                    <CardTitle className="text-xl font-bold flex items-center gap-2">
                        <UserRound className="h-5 w-5 text-teal-600" />
                        个人资料
                    </CardTitle>
                    <CardDescription>首页问候与头像种子会使用此昵称；留空则显示「语言学习者」。</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end">
                    <div className="flex-1 space-y-2">
                        <label htmlFor="display-name" className="text-sm font-semibold text-gray-700">
                            显示昵称
                        </label>
                        <input
                            id="display-name"
                            type="text"
                            value={displayNameInput}
                            onChange={(e) => setDisplayNameInput(e.target.value)}
                            placeholder="例如：小雅"
                            maxLength={24}
                            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all"
                        />
                    </div>
                    <Button
                        type="button"
                        variant="secondary"
                        className="shrink-0 rounded-xl"
                        onClick={() => {
                            setDisplayName(displayNameInput.trim());
                            toast('昵称已保存，返回首页即可看到效果', 'success');
                        }}
                    >
                        保存昵称
                    </Button>
                </CardContent>
            </Card>

            <Card className="border-none shadow-lg bg-white/80 backdrop-blur-md">
                <CardHeader>
                    <CardTitle className="text-xl font-bold flex items-center gap-2">
                        <Save className="h-5 w-5 text-blue-600" />
                        API 密钥管理
                    </CardTitle>
                    <CardDescription>
                        为不同模块分别配置 Key。每日阅读的搜索 Key 会经你部署的 Serverless 转发给搜索服务，不会写进我们的服务器。
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="grid gap-6">
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

                        <div className="space-y-2">
                            <label htmlFor="reading-key" className="text-sm font-semibold text-gray-700">
                                每日阅读 · 模型 Key (DeepSeek)
                            </label>
                            <p className="text-xs text-gray-500">用于翻译、语法分析、难度估计等，与对话 Key 相互独立。</p>
                            <input
                                id="reading-key"
                                type="password"
                                value={readingInput}
                                onChange={(e) => setReadingInput(e.target.value)}
                                placeholder="sk-..."
                                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                            />
                        </div>

                        <div className="space-y-2">
                            <label htmlFor="reading-search-key" className="text-sm font-semibold text-gray-700">
                                每日阅读 · 联网搜索 Key（如 Bing Web Search）
                            </label>
                            <p className="text-xs text-gray-500">
                                仅发往你在 .env 中配置的 VITE_READING_API_BASE（Vercel Functions），由服务端调用 Bing，不会在浏览器里直连第三方（除你的部署域名外）。
                            </p>
                            <input
                                id="reading-search-key"
                                type="password"
                                value={readingSearchInput}
                                onChange={(e) => setReadingSearchInput(e.target.value)}
                                placeholder="Ocp-Apim-Subscription-Key"
                                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                            />
                        </div>
                        
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
