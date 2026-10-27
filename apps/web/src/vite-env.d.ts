/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CATALOG_API_URL?: string;
  readonly VITE_INSIGHTS_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
