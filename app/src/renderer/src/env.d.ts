/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_IS_CANARY: boolean
  readonly VITE_APP_VERSION: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
