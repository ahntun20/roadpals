import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, getToken, setToken, type Me } from './api';
import { stopDriving } from './background';

interface Session {
  ready: boolean;
  me: Me | null;
  signIn: (token: string, me: Me) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  setMe: (me: Me) => void;
}

const Ctx = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [me, setMe] = useState<Me | null>(null);

  const refresh = useCallback(async () => {
    try {
      setMe(await api.me());
    } catch (e) {
      if ((e as { status?: number }).status === 401) { await setToken(null); setMe(null); }
    }
  }, []);

  useEffect(() => {
    (async () => {
      if (await getToken()) await refresh();
      setReady(true);
    })();
  }, [refresh]);

  const value = useMemo<Session>(() => ({
    ready,
    me,
    setMe,
    refresh,
    signIn: async (token, m) => { await setToken(token); setMe(m); },
    signOut: async () => { await stopDriving().catch(() => {}); await setToken(null); setMe(null); },
  }), [ready, me, refresh]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): Session {
  const s = useContext(Ctx);
  if (!s) throw new Error('useSession outside SessionProvider');
  return s;
}
