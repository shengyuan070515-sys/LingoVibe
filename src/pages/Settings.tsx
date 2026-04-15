import * as React from 'react';
import { useLocalStorage } from "@/hooks/use-local-storage";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Image, UserRound } from 'lucide-react';

export function SettingsPage() {
    const [unsplashApiKey, setUnsplashApiKey] = useLocalStorage('unsplash_api_key', '');
    const [displayName, setDisplayName] = useLocalStorage('lingovibe_display_name', '');

    const [unsplashInput, setUnsplashInput] = React.useState(unsplashApiKey);
    const [displayNameInput, setDisplayNameInput] = React.useState(displayName);

    React.useEffect(() => { setDisplayNameInput(displayName); }, [displayName]);
    React.useEffect(() => { setUnsplashInput(unsplashApiKey); }, [unsplashApiKey]);

    const { toast } = useToast();

    return (
        <div className="space-y-6 max-w-4xl mx-auto">
            {/* 个人资料 */}
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

            {/* 图片配置 */}
            <Card className="border-none shadow-lg bg-white/80 backdrop-blur-md">
                <CardHeader>
                    <CardTitle className="text-xl font-bold flex items-center gap-2">
                        <Image className="h-5 w-5 text-blue-600" />
                        图片配置（可选）
                    </CardTitle>
                    <CardDescription>
                        配置后生词卡片与视觉查词将显示真实搜索图片；不配置时使用默认占位图，不影响核心功能。
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <label htmlFor="unsplash-key" className="text-sm font-semibold text-gray-700 flex items-center justify-between">
                            Unsplash Access Key
                            <a href="https://unsplash.com/developers" target="_blank" rel="noreferrer" className="text-xs text-blue-500 hover:underline">
                                免费申请 →
                            </a>
                        </label>
                        <input
                            id="unsplash-key"
                            type="password"
                            value={unsplashInput}
                            onChange={(e) => setUnsplashInput(e.target.value)}
                            placeholder="粘贴你的 Unsplash Access Key"
                            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                        />
                    </div>
                    <Button
                        type="button"
                        className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white"
                        onClick={() => {
                            setUnsplashApiKey(unsplashInput.trim());
                            toast('Unsplash Key 已保存', 'success');
                        }}
                    >
                        保存
                    </Button>
                </CardContent>
            </Card>

            {/* 服务状态说明 */}
            <Card className="border-none shadow-lg bg-white/80 backdrop-blur-md">
                <CardHeader>
                    <CardTitle className="text-sm font-semibold text-gray-500">关于 AI 服务</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-sm text-gray-600 leading-relaxed">
                        AI 对话、生词查词、阅读分析等功能均由 LingoVibe 服务端统一提供，无需自行配置 API Key。
                        如遇服务异常，请稍后重试或联系管理员。
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}
