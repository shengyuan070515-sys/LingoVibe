/**
 * 北京时间（Asia/Shanghai）日历日，格式 YYYY-MM-DD。
 *
 * 仅服务端使用：用于「今日精选阅读」KV 缓存键，让全球客户端在同一 Beijing
 * 日历日命中同一份 AI 生成内容。客户端侧的 streak / 热图 / 今日闭环走
 * `toLocalDateKey`（用户设备本地时区），与手机日历感觉保持一致。
 */
export function getDateKeyShanghai(d: Date = new Date()): string {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Shanghai',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(d);
}
