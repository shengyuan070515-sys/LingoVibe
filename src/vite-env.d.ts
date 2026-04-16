/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_PRONUNCIATION_API_URL?: string;
    /** 每日阅读 Serverless 根 URL，如 https://xxx.vercel.app */
    readonly VITE_READING_API_BASE?: string;
    /** HMAC 签名密钥（前端可见，仅做轻量防护） */
    readonly VITE_LINGOVIBE_SIGNING_SECRET?: string;
    /** Unsplash 图片 API Key */
    readonly VITE_UNSPLASH_ACCESS_KEY?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
