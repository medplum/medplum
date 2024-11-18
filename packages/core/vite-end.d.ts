/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly MEDPLUM_VERSION: string
  // more env variables...
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
