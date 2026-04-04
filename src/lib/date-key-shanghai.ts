/** 北京时间（Asia/Shanghai）日历日，格式 YYYY-MM-DD */
export function getDateKeyShanghai(d: Date = new Date()): string {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Shanghai',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(d);
}
