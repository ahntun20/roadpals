import Constants from 'expo-constants';

/**
 * API base URL. Set EXPO_PUBLIC_API_URL (e.g. http://192.168.1.20:4000 — your computer's LAN IP,
 * so a phone on the same Wi-Fi can reach it) or change "extra.apiUrl" in app.json.
 */
export const API_URL: string =
  process.env.EXPO_PUBLIC_API_URL ||
  (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl ||
  'http://localhost:4000';

export const WS_URL = API_URL.replace(/^http/, 'ws');

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
