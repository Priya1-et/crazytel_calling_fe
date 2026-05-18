/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  readonly VITE_SIP_WSS_URL: string;
  readonly VITE_SIP_DOMAIN: string;
  readonly VITE_SIP_USERNAME: string;
  readonly VITE_SIP_PASSWORD: string;
  readonly VITE_TURN_URL: string;
  readonly VITE_TURN_USERNAME: string;
  readonly VITE_TURN_PASSWORD: string;
  readonly VITE_VERIFIED_OUTBOUND_NUMBERS: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
