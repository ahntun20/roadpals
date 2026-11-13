import Constants from 'expo-constants';

/**
 * API base URL. Set EXPO_PUBLIC_API_URL (e.g. http://192.168.1.20:4000 — your computer's LAN IP,
 * so a phone on the same Wi-Fi can reach it) or change "extra.apiUrl" in app.json.
 */
const rawUrl: string =
  process.env.EXPO_PUBLIC_API_URL ||
  (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl ||
  'http://localhost:4000';

/** Tolerates copy-paste mistakes: surrounding spaces/quotes, a trailing slash, or a missing scheme. */
export function normalizeApiUrl(url: string): string {
  let u = url.trim().replace(/^['"]|['"]$/g, '').trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(u)) u = `http://${u}`;
  return u;
}

export const API_URL = normalizeApiUrl(rawUrl);
/** http → ws, https → wss (required by React Native's WebSocket). */
export const WS_URL = API_URL.replace(/^http(s?):\/\//i, (_m, s: string) => `ws${s}://`);

export const COLORS = {
  cyan: '#33ccff',
  cyanDark: '#0f9fd6',
  ink: '#1f2a37',
  muted: '#6b7686',
  line: '#e6e9ee',
  bg: '#f6f7f9',
  green: '#22c55e',
  orange: '#ff9f1c',
  red: '#ef4444',
  purple: '#8b5cf6',
};
