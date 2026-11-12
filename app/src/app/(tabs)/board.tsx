import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, Share, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { VEHICLE_ICON } from '@roadpals/shared';
import { api, type LeaderboardEntry, type Team } from '@/lib/api';
import { COLORS } from '@/lib/config';
import { useLive } from '@/lib/live';
import { useSession } from '@/lib/session';
import { Button, Card, SectionTitle, ui } from '@/components/ui';

export default function Board() {
  const { me, refresh } = useSession();
  const live = useLive();
  const [lb, setLb] = useState<{ week: string; entries: LeaderboardEntry[]; me: { rank: number | null; score: number } } | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
  const [teamName, setTeamName] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [l, t] = await Promise.all([api.leaderboard(), api.team()]);
      setLb(l); setTeam(t.team);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const act = async (fn: () => Promise<unknown>) => {
    try { await fn(); await Promise.all([load(), refresh()]); } catch (e) { live.toast('⚠️', (e as Error).message); }
  };

  if (!me) return null;
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <ScrollView refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />} contentContainerStyle={{ paddingBottom: 30 }}>
        <SectionTitle>Team challenge</SectionTitle>
        {team ? (
          <Card>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontWeight: '900', fontSize: 16 }}>🏆 {team.name}</Text>
              <Text style={ui.muted}>{team.km} / {team.goalKm} km{team.rewarded ? ' ✓' : ''}</Text>
            </View>
            <View style={{ height: 8, backgroundColor: '#eef1f4', borderRadius: 6, marginVertical: 10, overflow: 'hidden' }}>
              <View style={{ height: '100%', width: `${Math.min(100, (team.km / team.goalKm) * 100)}%`, backgroundColor: COLORS.cyan }} />
            </View>
            <Text style={ui.muted}>{team.members.map((m) => `${VEHICLE_ICON[m.vehicleType]} ${m.name}`).join('  ·  ')}</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <Button title={`Share code ${team.code}`} style={{ flex: 1 }} onPress={() => Share.share({ message: `Join my RoadPals team "${team.name}" with code ${team.code}` })} />
              <Button title="Leave" kind="secondary" onPress={() => act(api.leaveTeam)} />
            </View>
          </Card>
        ) : (
          <Card>
            <Text style={{ fontWeight: '700', marginBottom: 8 }}>Drive together: everyone gets points when the team hits its weekly km goal.</Text>
            <TextInput style={ui.input} placeholder="New team name" value={teamName} onChangeText={setTeamName} />
            <Button title="Create team" style={{ marginTop: 8 }} disabled={teamName.trim().length < 2} onPress={() => act(() => api.createTeam(teamName))} />
            <TextInput style={[ui.input, { marginTop: 14 }]} placeholder="Or join with a code" autoCapitalize="characters" value={code} onChangeText={setCode} />
            <Button title="Join team" kind="dark" style={{ marginTop: 8 }} disabled={code.trim().length < 4} onPress={() => act(() => api.joinTeam(code))} />
          </Card>
        )}

        <SectionTitle>Invite friends</SectionTitle>
        <Card>
          <Text style={{ fontWeight: '700' }}>You get points when a friend signs up with your code and drives their first km.</Text>
          <Button title={`Share invite code ${me.inviteCode}`} style={{ marginTop: 10 }} onPress={() => Share.share({ message: `Drive with me on RoadPals! Use my invite code ${me.inviteCode} when you sign up.` })} />
        </Card>

        <SectionTitle>This week · {lb?.week ?? ''}</SectionTitle>
        <Card style={{ padding: 0 }}>
          {lb?.entries.length ? lb.entries.map((e) => (
            <View key={e.id} style={[ui.row, e.id === me.id && { backgroundColor: '#e9f9ff' }]}>
              <Text style={{ width: 24, fontWeight: '900', color: COLORS.muted, textAlign: 'right' }}>{e.rank}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '800' }}>{VEHICLE_ICON[e.vehicleType]} {e.id === me.id ? 'You' : e.name}</Text>
                <Text style={ui.muted}>{e.brand}{e.prize ? ` · 🥇 +${e.prize} at week end` : ''}</Text>
              </View>
              <Text style={{ fontWeight: '900' }}>{e.score}</Text>
            </View>
          )) : <Text style={{ padding: 16, color: COLORS.muted }}>No points yet this week.</Text>}
          {lb && lb.me.rank && lb.me.rank > lb.entries.length ? <Text style={{ padding: 14, fontWeight: '800' }}>You’re #{lb.me.rank} with {lb.me.score} pts</Text> : null}
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}
