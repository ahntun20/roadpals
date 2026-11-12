import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Redirect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BRANDS, VEHICLE_ICON, type VehicleType } from '@roadpals/shared';
import { api, ApiError } from '@/lib/api';
import { COLORS } from '@/lib/config';
import { useSession } from '@/lib/session';
import { Button, ui } from '@/components/ui';

type Step = 'phone' | 'code' | 'profile';
const TYPES: VehicleType[] = ['car', 'taxi', 'bus', 'truck', 'container'];

export default function SignIn() {
  const { me, signIn } = useSession();
  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState<VehicleType>('car');
  const [brand, setBrand] = useState(BRANDS.car[0].name);
  const [invite, setInvite] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [devCode, setDevCode] = useState<string | undefined>();

  if (me) return <Redirect href="/" />;

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError('');
    try { await fn(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  const sendCode = () => run(async () => {
    const r = await api.requestCode(phone);
    setDevCode(r.devCode);
    setStep('code');
  });

  const verify = (withProfile: boolean) => run(async () => {
    try {
      const r = await api.verify({ phone, code, tz, ...(withProfile ? { name, vehicleType: type, vehicleBrand: brand, inviteCode: invite || undefined } : {}) });
      await signIn(r.token, r.me);
    } catch (e) {
      if (e instanceof ApiError && e.body.needsProfile) { setStep('profile'); return; }
      throw e;
    }
  });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 24, gap: 14 }} keyboardShouldPersistTaps="handled">
          <Text style={{ fontSize: 34, fontWeight: '900', color: COLORS.ink, marginTop: 30 }}>RoadPals</Text>
          <Text style={{ fontSize: 16, color: COLORS.muted, fontWeight: '600' }}>Earn points for every km, every driver you pass and every wave.</Text>

          {step === 'phone' && (<>
            <Text style={label}>Your phone number</Text>
            <TextInput style={ui.input} value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="+1 555 123 4567" autoComplete="tel" />
            <Button title="Send code" onPress={sendCode} loading={busy} disabled={phone.replace(/\D/g, '').length < 8} />
          </>)}

          {step === 'code' && (<>
            <Text style={label}>Enter the 6-digit code we sent to {phone}</Text>
            <TextInput style={[ui.input, { letterSpacing: 6, fontSize: 22 }]} value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} placeholder="000000" autoComplete="one-time-code" />
            {devCode ? <Text style={ui.muted}>Dev mode code: {devCode}</Text> : null}
            <Button title="Continue" onPress={() => verify(false)} loading={busy} disabled={code.length !== 6} />
            <Button title="Change number" kind="secondary" onPress={() => setStep('phone')} />
          </>)}

          {step === 'profile' && (<>
            <Text style={label}>Driver name (shown to other drivers)</Text>
            <TextInput style={ui.input} value={name} onChangeText={setName} maxLength={24} placeholder="e.g. MiaOnMain" autoCapitalize="none" />
            <Text style={label}>What do you drive?</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {TYPES.map((t) => (
                <Chip key={t} on={type === t} onPress={() => { setType(t); setBrand(BRANDS[t][0].name); }} text={`${VEHICLE_ICON[t]} ${t[0].toUpperCase()}${t.slice(1)}`} />
              ))}
            </View>
            <Text style={label}>Brand (sets your car’s colour on the map)</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {BRANDS[type].map((b) => <Chip key={b.name} on={brand === b.name} onPress={() => setBrand(b.name)} text={b.name} color={b.color} />)}
            </View>
            <Text style={label}>Invite code (optional)</Text>
            <TextInput style={ui.input} value={invite} onChangeText={setInvite} autoCapitalize="characters" placeholder="From a friend" />
            <Button title="Start driving" onPress={() => verify(true)} loading={busy} disabled={name.trim().length < 2} />
          </>)}

          {error ? <Text style={{ color: COLORS.red, fontWeight: '700' }}>{error}</Text> : null}
          <Text style={[ui.muted, { marginTop: 20 }]}>RoadPals uses your location only while you drive. Waving is locked while the car is moving unless Passenger mode is on.</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const label = { fontWeight: '800' as const, color: COLORS.ink, marginTop: 8 };

function Chip({ text, on, onPress, color }: { text: string; on: boolean; onPress: () => void; color?: string }) {
  return (
    <Pressable onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1.5, borderColor: on ? COLORS.cyan : COLORS.line, backgroundColor: on ? '#e9f9ff' : '#fff' }}>
      {color ? <View style={{ width: 12, height: 12, borderRadius: 4, backgroundColor: color, borderWidth: 1, borderColor: 'rgba(0,0,0,0.15)' }} /> : null}
      <Text style={{ fontWeight: '700', color: COLORS.ink }}>{text}</Text>
    </Pressable>
  );
}
