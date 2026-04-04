import { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react';

/** 同页多组件共用一个 key 时，写入后广播，避免各实例状态不一致导致「空值写回」覆盖已保存的 API Key */
export const LINGOVIBE_LS_SYNC = 'lingovibe-localstorage';

export function readStoredValue<T>(key: string, initialValue: T): T {
    if (typeof window === 'undefined') return initialValue;
    try {
        const item = window.localStorage.getItem(key);
        // 必须用 null 判断：不能用 item ? …，否则合法存下的 JSON 若解析异常会先被当成「无数据」
        if (item === null) return initialValue;
        try {
            return JSON.parse(item) as T;
        } catch {
            // 历史或非 JSON 直存（如未加引号的 sk-…）解析失败时，字符串类配置保留原文，避免被当成空并写回覆盖
            if (typeof initialValue === 'string') return item as unknown as T;
            return initialValue;
        }
    } catch (e) {
        console.error(`Error reading localStorage key "${key}":`, e);
        return initialValue;
    }
}

export function emitLocalStorageSync(key: string): void {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent(LINGOVIBE_LS_SYNC, { detail: { key } }));
}

/** 避免对象型状态每次 JSON.parse 得到新引用 → 误判变化 → 写入 → 广播 → 再拉盘 的死循环（会搞乱 ai_chat_v2 等大块数据） */
function storedDeepEqual<T>(prev: T, next: T): boolean {
    if (Object.is(prev, next)) return true;
    if (typeof prev !== 'object' || prev === null || typeof next !== 'object' || next === null) return false;
    try {
        return JSON.stringify(prev) === JSON.stringify(next);
    } catch {
        return false;
    }
}

export function useLocalStorage<T>(key: string, initialValue: T): [T, React.Dispatch<React.SetStateAction<T>>] {
    const initialRef = useRef(initialValue);
    initialRef.current = initialValue;

    const [value, setValue] = useState<T>(() => readStoredValue(key, initialValue));

    const pullFromDisk = useCallback(() => {
        setValue((prev) => {
            const next = readStoredValue(key, initialRef.current);
            if (storedDeepEqual(prev, next)) return prev;
            return next;
        });
    }, [key]);

    // 挂载/切 key 时再从磁盘拉一次，避免首帧与 Strict Mode 下状态与 localStorage 短暂不一致后误写入空值
    useLayoutEffect(() => {
        pullFromDisk();
    }, [key, pullFromDisk]);

    useEffect(() => {
        const onSync = (e: Event) => {
            const k = (e as CustomEvent<{ key: string }>).detail?.key;
            if (k === key) pullFromDisk();
        };
        const onStorage = (e: StorageEvent) => {
            if (e.key === key && e.storageArea === localStorage) pullFromDisk();
        };
        window.addEventListener(LINGOVIBE_LS_SYNC, onSync as EventListener);
        window.addEventListener('storage', onStorage);
        return () => {
            window.removeEventListener(LINGOVIBE_LS_SYNC, onSync as EventListener);
            window.removeEventListener('storage', onStorage);
        };
    }, [key, pullFromDisk]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        try {
            window.localStorage.setItem(key, JSON.stringify(value));
            window.dispatchEvent(new CustomEvent(LINGOVIBE_LS_SYNC, { detail: { key } }));
        } catch (error) {
            console.error(`Error setting localStorage key "${key}":`, error);
        }
    }, [key, value]);

    return [value, setValue];
}
