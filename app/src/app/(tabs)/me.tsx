import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BRANDS, VEHICLE_ICON, type RuleDef, type VehicleType } from '@roadpals/shared';
import { api } from '@/lib/api';
import { API_URL, COLORS } from '@/lib/config';
import { useLive } from '@/lib/live';
import { useSession } from '@/lib/session';
import { Button, Card, SectionTitle, ui } from '@/components/ui';

const TYPES: VehicleType[] = ['car', 'taxi', 'bus', 'truck', 'container'];

export default function MeScreen() {
  const { me, setMe, signOut } = useSession();
  const live = useLive();
  const [name, setName] = useState(me?.name ?? '');
  const [rules, setRules] = useState<RuleDef[]>([]);
  useEffect(() => { void api.rules().then((r) => setRules(r.rules)).catch(() => {}); }, []);
  if (!me) return null;

  const save = async (patch: Parameters<typeof api.updateMe>[0]) => {
    try { setMe(await api.updateMe(patch)); } catch (e) { live.toast('⚠️', (e as Error).message); }
  };

  let lastCat = '';
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <SectionTitle>Profile</SectionTitle>
        <Card>
          <Text style={{ fontWeight: '800', marginBottom: 6 }}>Driver name</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput style={[ui.input, { flex: 1 }]} value={name} onChangeText={setName} maxLength={24} />
            <Button title="Save" onPress={() => save({ name })} disabled={name.trim().length < 2 || name === me.name} />
          </View>
          <Text style={{ fontWeight: '800', marginTop: 14, marginBottom: 6 }}>Vehicle</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {TYPES.map((t) => <Chip key={t} on={me.vehicleType === t} onPress={() => save({ vehicleType: t })} text={`${VEHICLE_ICON[t]} ${t}`} />)}
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            {BRANDS[me.vehicleType].map((b) => <Chip key={b.name} on={me.vehicleBrand === b.name} onPress={() => save({ vehicleBrand: b.name })} text={b.name} color={b.color} />)}
          </View>
        </Card>

        <SectionTitle>Safety</SectionTitle>
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ flex: 1, paddingRight: 10 }}>
              <Text style={{ fontWeight: '800' }}>Passenger mode</Text>
              <Text style={ui.muted}>Waving is locked while the car is moving. Turn this on only if you’re not the driver.</Text>
            </View>
            <Switch value={me.passengerMode} onValueChange={(v) => save({ passengerMode: v })} trackColor={{ true: COLORS.cyan, false: '#d5dae1' }} />
          </View>
        </Card>

        <SectionTitle>How you earn points</SectionTitle>
        <Card style={{ padding: 0 }}>
          {rules.filter((r) => r.enabled).map((r) => {
            const header = r.category !== lastCat ? (lastCat = r.category) : null;
            return (
              <View key={r.id}>
                {header && <Text style={{ paddingHorizontal: 14, paddingTop: 12, fontWeight: '900', fontSize: 12, color: COLORS.cyanDark }}>{header.toUpperCase()}</Text>}
                <View style={ui.row}>
                  <Text style={{ fontSize: 18, width: 26, textAlign: 'center' }}>{r.icon}</Text>
                  <View style={{ flex: 1 }}><Text style={{ fontWeight: '800' }}>{r.name}</Text><Text style={ui.muted}>{r.description}</Text></View>
                  <Text style={{ fontWeight: '900', color: COLORS.green }}>+{r.points}</Text>
                </View>
              </View>
            );
          })}
        </Card>

        <Card>
          <Text style={ui.muted}>Server: {API_URL}</Text>
          <Button title="Sign out" kind="danger" style={{ marginTop: 10 }} onPress={signOut} />
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

function Chip({ text, on, onPress, color }: { text: string; on: boolean; onPress: () => void; color?: string }) {
  return (
    <Pressable onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10, borderWidth: 1.5, borderColor: on ? COLORS.cyan : COLORS.line, backgroundColor: on ? '#e9f9ff' : '#fff' }}>
      {color ? <View style={{ width: 11, height: 11, borderRadius: 3, backgroundColor: color, borderWidth: 1, borderColor: 'rgba(0,0,0,0.15)' }} /> : null}
      <Text style={{ fontWeight: '700', textTransform: 'capitalize' }}>{text}</Text>
    </Pressable>
  );
}
