/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FEISHU_APP_ID: string
  readonly VITE_API_BASE_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
