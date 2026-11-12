import { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { LedgerEntry } from '@roadpals/shared';
import { api } from '@/lib/api';
import { COLORS } from '@/lib/config';
import { useLive } from '@/lib/live';
import { useSession } from '@/lib/session';
import { ScoreBar, ui } from '@/components/ui';

export default function Activity() {
  const { me, refresh } = useSession();
  const live = useLive();
  const [history, setHistory] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setHistory((await api.ledger(150)).entries); await refresh(); } finally { setLoading(false); }
  }, [refresh]);
  useEffect(() => { void load(); }, [load]);

  // Live entries first, then history without duplicates.
  const seen = new Set<string>();
  const rows = [...live.feed, ...history].filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true)));

  if (!me) return null;
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: COLORS.cyan }}>
      <ScoreBar me={me} />
      <View style={{ flexDirection: 'row', backgroundColor: '#fff', paddingVertical: 10 }}>
        <Stat n={me.stats.km.toFixed(1)} label="km driven" />
        <Stat n={String(me.stats.streak)} label="day streak 🔥" />
        <Stat n={String(me.stats.exploredCells)} label="areas explored" />
      </View>
      <FlatList
        style={{ backgroundColor: '#fff' }}
        data={rows}
        keyExtractor={(e) => e.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        ListEmptyComponent={<Text style={{ padding: 30, textAlign: 'center', color: COLORS.muted, fontWeight: '600' }}>Start a drive to earn points: pass other drivers, wave, explore and report hazards.</Text>}
        renderItem={({ item }) => (
          <View style={ui.row}>
            <Text style={{ fontSize: 18, width: 26, textAlign: 'center' }}>{item.icon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '700', color: COLORS.ink }}>{item.text}</Text>
              <Text style={ui.muted}>{new Date(item.createdAt).toLocaleString()}</Text>
            </View>
            <Text style={{ fontWeight: '900', color: item.amount < 0 ? COLORS.red : COLORS.green }}>{item.amount < 0 ? `−${-item.amount}` : `+${item.amount}`}</Text>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

function Stat({ n, label }: { n: string; label: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={{ fontSize: 18, fontWeight: '900', color: COLORS.ink }}>{n}</Text>
      <Text style={ui.muted}>{label}</Text>
    </View>
  );
}
