/** Vite env variable names — use with env.ts only; do not read import.meta.env elsewhere. */
export const ENV_KEYS = {
  API_BASE_URL: 'VITE_API_BASE_URL',
  SIP_WSS_URL: 'VITE_SIP_WSS_URL',
  SIP_DOMAIN: 'VITE_SIP_DOMAIN',
  SIP_USERNAME: 'VITE_SIP_USERNAME',
  SIP_PASSWORD: 'VITE_SIP_PASSWORD',
  TURN_URL: 'VITE_TURN_URL',
  TURN_USERNAME: 'VITE_TURN_USERNAME',
  TURN_PASSWORD: 'VITE_TURN_PASSWORD',
  VERIFIED_OUTBOUND_NUMBERS: 'VITE_VERIFIED_OUTBOUND_NUMBERS',
} as const;

export const ENV_DEFAULTS = {
  API_BASE_URL: 'http://localhost:3001',
  SIP_WSS_URL: 'wss://YOUR_PBX_HOST:8089/ws',
  SIP_DOMAIN: 'YOUR_PBX_HOST',
  SIP_USERNAME: 'venus',
  SIP_PASSWORD: '',
  TURN_URL: 'stun:stun.l.google.com:19302',
  TURN_USERNAME: '',
  TURN_PASSWORD: '',
} as const;

/** Default Crazytel-verified CLI/DID (E.164 without +). */
export const DEFAULT_VERIFIED_CLI = '61272643281' as const;

export const SIP_HEADER_OUTGOING_NUMBER = 'X-Outgoing-Number';

export const API_PATHS = {
  ASTERISK_EVENTS: '/v1/asterisk/events',
  DND: (consultant: string) => `/v1/dnd/${consultant}`,
} as const;

export const LOG_PREFIX = '[WebCalling]';

export const DIAL_PLACEHOLDER = 'AU 04… or 02… ; India +91… or 001191…';

export const UI_TITLE = 'Web Calling Console';

export const ASTERISK_EVENT_TYPES = [
  'inbound',
  'oncall',
  'disconnected',
  'failed',
  'DNDon',
  'DNDoff',
] as const;

export type AsteriskEventType = (typeof ASTERISK_EVENT_TYPES)[number];
