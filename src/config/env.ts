import { DEFAULT_VERIFIED_CLI, ENV_DEFAULTS } from './constants';
import { toE164Cli } from '../utils/toE164Cli';

function envOr(key: keyof ImportMetaEnv, fallback: string): string {
  const raw = import.meta.env[key];
  const v = typeof raw === 'string' ? raw : undefined;
  if (v === undefined || v.trim() === '') {
    return fallback;
  }
  return v;
}

export const appConfig = {
  apiBaseUrl: envOr('VITE_API_BASE_URL', ENV_DEFAULTS.API_BASE_URL),
  sipWebsocket: envOr('VITE_SIP_WSS_URL', ENV_DEFAULTS.SIP_WSS_URL),
  sipDomain: envOr('VITE_SIP_DOMAIN', ENV_DEFAULTS.SIP_DOMAIN),
  sipUsername: envOr('VITE_SIP_USERNAME', ENV_DEFAULTS.SIP_USERNAME),
  sipPassword: envOr('VITE_SIP_PASSWORD', ENV_DEFAULTS.SIP_PASSWORD),
  turnUrl: envOr('VITE_TURN_URL', ENV_DEFAULTS.TURN_URL),
  turnUsername: envOr('VITE_TURN_USERNAME', ENV_DEFAULTS.TURN_USERNAME),
  turnPassword: envOr('VITE_TURN_PASSWORD', ENV_DEFAULTS.TURN_PASSWORD),
} as const;

/** Outbound CLI list (E.164 61…) from VITE_VERIFIED_OUTBOUND_NUMBERS or default 61272643281. */
export function getOutgoingNumbers(): string[] {
  const raw = import.meta.env.VITE_VERIFIED_OUTBOUND_NUMBERS;
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  if (trimmed) {
    const list = trimmed
      .split(',')
      .map((s) => toE164Cli(s))
      .filter((s) => s.length > 0);
    if (list.length > 0) {
      return list;
    }
  }
  return [DEFAULT_VERIFIED_CLI];
}

export const outgoingNumbers = getOutgoingNumbers();

export function buildIceServer(): RTCIceServer {
  return {
    urls: [appConfig.turnUrl],
    ...(appConfig.turnUsername && appConfig.turnPassword
      ? { username: appConfig.turnUsername, credential: appConfig.turnPassword }
      : {}),
  };
}
