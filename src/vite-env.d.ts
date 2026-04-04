/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_PRONUNCIATION_API_URL?: string;
    /** 每日阅读 Serverless 根 URL，如 https://xxx.vercel.app */
    readonly VITE_READING_API_BASE?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
