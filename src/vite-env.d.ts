/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BLUECORE_URL?: string
  readonly VITE_KEYCLOAK_URL?: string
  readonly VITE_KEYCLOAK_CLIENT_ID?: string
  readonly VITE_QA_URL?: string
  /** The commit the image was built from (see Dockerfile). */
  readonly VITE_VERSION?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
