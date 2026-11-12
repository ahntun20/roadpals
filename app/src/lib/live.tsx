/**
 * Realtime connection: one WebSocket per signed-in session. Receives nearby drivers, points,
 * waves and hazard prompts; sends waves. GPS itself is uploaded by ./background.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as Haptics from 'expo-haptics';
import type { Fix, HazardDTO, LedgerEntry, PublicDriver, ServerMsg } from '@roadpals/shared';
import { getToken } from './api';
import { onFix } from './background';
import { WS_URL } from './config';
import { useSession } from './session';

export interface Toast { id: number; icon: string; text: string; points?: number }

interface Live {
  connected: boolean;
  myFix: Fix | null;
  drivers: PublicDriver[];
  toasts: Toast[];
  feed: LedgerEntry[];
  incomingWave: { name: string; emoji: string; until: number } | null;
  hazardPrompt: HazardDTO | null;
  dismissHazard: () => void;
  wave: () => void;
  toast: (icon: string, text: string) => void;
}

const Ctx = createContext<Live | null>(null);
const WAVE_ERRORS: Record<string, string> = {
  locked_while_driving: 'Waving is locked while you drive. Turn on Passenger mode if you’re not the driver.',
  nobody_nearby: 'Nobody within 200 m to wave at',
  no_position: 'Start driving to wave',
};

export function LiveProvider({ children }: { children: ReactNode }) {
  const { me, setMe } = useSession();
  const [connected, setConnected] = useState(false);
  const [myFix, setMyFix] = useState<Fix | null>(null);
  const [drivers, setDrivers] = useState<PublicDriver[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [feed, setFeed] = useState<LedgerEntry[]>([]);
  const [incomingWave, setIncomingWave] = useState<Live['incomingWave']>(null);
  const [hazardPrompt, setHazardPrompt] = useState<HazardDTO | null>(null);
  const ws = useRef<WebSocket | null>(null);
  const meRef = useRef(me);
  meRef.current = me;
  const nextId = useRef(1);

  const toast = useCallback((icon: string, text: string, points?: number) => {
    const id = nextId.current++;
    setToasts((t) => [...t.slice(-3), { id, icon, text, points }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3000);
  }, []);

  useEffect(() => onFix(setMyFix), []);

  useEffect(() => {
    if (!me?.id) return;
    let closed = false;
    let retry: ReturnType<typeof setTimeout>;
    let ping: ReturnType<typeof setInterval>;

    const open = async () => {
      const token = await getToken();
      if (!token || closed) return;
      const sock = new WebSocket(`${WS_URL}/v1/ws?token=${encodeURIComponent(token)}`);
      ws.current = sock;
      sock.onopen = () => { setConnected(true); ping = setInterval(() => sock.send(JSON.stringify({ t: 'ping' })), 25000); };
      sock.onclose = () => { setConnected(false); clearInterval(ping); if (!closed) retry = setTimeout(open, 3000); };
      sock.onerror = () => {};
      sock.onmessage = (ev) => {
        const msg = JSON.parse(String(ev.data)) as ServerMsg;
        switch (msg.t) {
          case 'nearby': setDrivers(msg.drivers); break;
          case 'points': {
            setFeed((f) => [msg.entry, ...f].slice(0, 200));
            const m = meRef.current;
            if (m) setMe({ ...m, lifetimePoints: msg.lifetime, balance: msg.balance });
            if (!msg.entry.quiet && msg.entry.amount > 0) toast(msg.entry.icon, msg.entry.text, msg.entry.amount);
            break;
          }
          case 'waved':
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            setIncomingWave(msg.canWaveBackUntil ? { name: msg.from.name, emoji: msg.from.emoji, until: msg.canWaveBackUntil } : null);
            if (!msg.canWaveBackUntil) toast(msg.from.emoji, `${msg.from.name} waved back`);
            break;
          case 'waveResult':
            if (!msg.ok) toast('🤷', WAVE_ERRORS[msg.reason ?? ''] ?? 'Couldn’t wave');
            setIncomingWave(null);
            break;
          case 'hazardPrompt':
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            setHazardPrompt(msg.hazard);
            break;
          case 'toast': toast(msg.icon, msg.text); break;
          case 'fixRejected': if (msg.reason === 'mocked') toast('🚫', 'Mock locations don’t earn points'); break;
        }
      };
    };
    void open();
    return () => { closed = true; clearTimeout(retry); clearInterval(ping); ws.current?.close(); ws.current = null; };
  }, [me?.id, setMe, toast]);

  useEffect(() => {
    if (!incomingWave) return;
    const t = setTimeout(() => setIncomingWave(null), Math.max(0, incomingWave.until - Date.now()));
    return () => clearTimeout(t);
  }, [incomingWave]);

  const wave = useCallback(() => {
    if (ws.current?.readyState !== WebSocket.OPEN) { toast('📡', 'Not connected'); return; }
    void Haptics.selectionAsync();
    ws.current.send(JSON.stringify({ t: 'wave' }));
  }, [toast]);

  const value = useMemo<Live>(() => ({
    connected, myFix, drivers, toasts, feed, incomingWave, hazardPrompt,
    dismissHazard: () => setHazardPrompt(null), wave, toast,
  }), [connected, myFix, drivers, toasts, feed, incomingWave, hazardPrompt, wave, toast]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLive(): Live {
  const l = useContext(Ctx);
  if (!l) throw new Error('useLive outside LiveProvider');
  return l;
}
