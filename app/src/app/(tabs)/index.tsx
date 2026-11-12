import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import MapView, { Marker, Polyline, type LongPressEvent } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';
import { HAZARDS, VEHICLE_ICON, type HazardDTO, type HazardType } from '@roadpals/shared';
import { api, type Place } from '@/lib/api';
import { isDriving, startDriving, stopDriving, type DriveMode } from '@/lib/background';
import { COLORS } from '@/lib/config';
import { useLive } from '@/lib/live';
import { mapStyleFor } from '@/lib/mapStyles';
import { useSession } from '@/lib/session';
import { Button, Toasts } from '@/components/ui';
import { Vehicle } from '@/components/Vehicle';

type LatLng = { latitude: number; longitude: number };
const ll = (p: { lat: number; lng: number }): LatLng => ({ latitude: p.lat, longitude: p.lng });

export default function MapScreen() {
  const { me, refresh } = useSession();
  const live = useLive();
  const map = useRef<MapView>(null);
  const [mode, setMode] = useState<DriveMode | null>(null);
  const [follow, setFollow] = useState(true);
  const [hazards, setHazards] = useState<HazardDTO[]>([]);
  const [places, setPlaces] = useState<Place[]>([]);
  const [picker, setPicker] = useState<'closed' | 'report' | 'road'>('closed');
  const [roadName, setRoadName] = useState('');
  const [pendingDest, setPendingDest] = useState<LatLng | null>(null);
  const [dest, setDest] = useState<LatLng | null>(me?.activeTrip ? ll(me.activeTrip) : null);
  const [route, setRoute] = useState<LatLng[] | null>(null);

  useEffect(() => { void isDriving().then((d) => d && setMode('foreground')); }, []);

  // Follow my car.
  useEffect(() => {
    if (!follow || !live.myFix) return;
    map.current?.animateCamera({ center: ll(live.myFix), heading: live.myFix.heading ?? undefined, zoom: 16 }, { duration: 600 });
  }, [live.myFix, follow]);

  // Hazards and places near me, refreshed every 30 s.
  const fixRef = useRef(live.myFix);
  fixRef.current = live.myFix;
  useEffect(() => {
    const load = async () => {
      const f = fixRef.current;
      if (!f) return;
      const [h, p] = await Promise.all([api.hazards(f.lat, f.lng).catch(() => null), api.places(f.lat, f.lng).catch(() => null)]);
      if (h) setHazards(h.hazards);
      if (p) setPlaces(p.places);
    };
    void load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [live.myFix != null]);

  const toggleDrive = async () => {
    try {
      if (mode) { await stopDriving(); setMode(null); live.toast('🅿️', 'Drive ended'); void refresh(); }
      else { const m = await startDriving(); setMode(m); live.toast('🚗', m === 'background' ? 'Drive started — works with the screen off' : 'Drive started (keep the app open)'); }
    } catch (e) { live.toast('📍', (e as Error).message); }
  };

  const report = async (type: HazardType) => {
    setPicker('closed');
    const f = live.myFix;
    if (!f) return live.toast('📍', 'Start driving to report');
    const r = await api.report(type, f.lat, f.lng).catch((e) => { live.toast('⚠️', e.message); return null; });
    if (r) setHazards((h) => [r.hazard, ...h.filter((x) => x.id !== r.hazard.id)]);
  };

  const suggestRoad = async () => {
    const f = live.myFix;
    if (!f || roadName.trim().length < 2) return;
    await api.mapEdit(f.lat, f.lng, roadName.trim()).catch((e) => live.toast('✏️', e.message));
    setRoadName(''); setPicker('closed');
  };

  const vote = async (stillThere: boolean) => {
    const h = live.hazardPrompt;
    live.dismissHazard();
    if (h) await api.vote(h.id, stillThere).catch(() => {});
  };

  const navigate = async (to: LatLng) => {
    setPendingDest(null);
    await api.startTrip(to.latitude, to.longitude);
    setDest(to);
    setFollow(true);
    const f = live.myFix;
    if (f) {
      const r = await api.route({ lat: f.lat, lng: f.lng }, { lat: to.latitude, lng: to.longitude }).catch(() => null);
      setRoute(r ? r.points.map(ll) : null);
    }
  };
  const cancelTrip = async () => { await api.cancelTrip().catch(() => {}); setDest(null); setRoute(null); };

  // Clear the destination once the server says we've arrived.
  useEffect(() => {
    if (dest && live.feed[0]?.ruleId === 'trip') { setDest(null); setRoute(null); }
  }, [live.feed[0]?.id]);

  if (!me) return null;
  const theme = me.equipped.theme.replace('theme:', '');
  const waveBack = live.incomingWave && live.incomingWave.until > Date.now();

  return (
    <View style={{ flex: 1 }}>
      <MapView
        ref={map}
        style={StyleSheet.absoluteFill}
        initialRegion={live.myFix ? { ...ll(live.myFix), latitudeDelta: 0.01, longitudeDelta: 0.01 } : { latitude: 40.758, longitude: -73.9855, latitudeDelta: 0.05, longitudeDelta: 0.05 }}
        customMapStyle={Platform.OS === 'android' ? mapStyleFor(theme) : undefined}
        userInterfaceStyle={theme === 'night' ? 'dark' : 'light'}
        showsUserLocation={!live.myFix}
        showsCompass={false}
        showsTraffic={false}
        pitchEnabled
        onPanDrag={() => setFollow(false)}
        onLongPress={(e: LongPressEvent) => setPendingDest(e.nativeEvent.coordinate)}
      >
        {route && <Polyline coordinates={route} strokeColor={COLORS.cyan} strokeWidth={6} />}
        {places.map((p) => (
          <Marker key={`p${p.id}`} coordinate={ll(p)} title={p.name} description={p.checkedInToday ? 'Checked in today' : 'Drive past to check in'} tracksViewChanges={false}>
            <View style={[s.place, p.checkedInToday && { borderColor: COLORS.green, backgroundColor: '#dcfce7' }]}><Text style={{ fontSize: 16 }}>{p.icon}</Text></View>
          </Marker>
        ))}
        {hazards.map((h) => (
          <Marker key={`h${h.id}`} coordinate={ll(h)} title={HAZARDS[h.type].label} description={`Reported by ${h.mine ? 'you' : h.reporterName} · ${h.confirms} confirmations`} tracksViewChanges={false}>
            <View style={[s.hazard, h.mine && { borderColor: COLORS.orange }]}><Text style={{ fontSize: 15 }}>{HAZARDS[h.type].icon}</Text></View>
          </Marker>
        ))}
        {live.drivers.map((d) => (
          <Marker key={d.id} coordinate={ll(d)} rotation={d.heading} flat anchor={{ x: 0.5, y: 0.5 }} title={`${VEHICLE_ICON[d.vehicleType]} ${d.name}`} description={`${d.brand}${d.passes ? ` · passed ${d.passes}×` : ''}`} tracksViewChanges={false}>
            <Vehicle type={d.vehicleType} color={d.color} rainbow={d.skin === 'skin:rainbow'} />
          </Marker>
        ))}
        {live.myFix && (
          <Marker coordinate={ll(live.myFix)} rotation={live.myFix.heading ?? 0} flat anchor={{ x: 0.5, y: 0.5 }} zIndex={10} tracksViewChanges={false}>
            <Vehicle me type={me.vehicleType} color={me.profile.color} rainbow={me.equipped.skin === 'skin:rainbow'} />
          </Marker>
        )}
        {dest && <Marker coordinate={dest} title="Destination"><Text style={{ fontSize: 26 }}>🏁</Text></Marker>}
        {pendingDest && <Marker coordinate={pendingDest} pinColor={COLORS.cyan} />}
      </MapView>

      <SafeAreaView edges={['top']} style={s.top} pointerEvents="box-none">
        <View style={s.topRow} pointerEvents="box-none">
          <View style={s.pill}>
            <View style={[s.dot, { backgroundColor: live.connected ? COLORS.green : COLORS.red }]} />
            <Text style={s.pillText}>{me.lifetimePoints.toLocaleString()} pts · 💰 {me.balance.toLocaleString()}</Text>
          </View>
          <Pressable onPress={toggleDrive} style={[s.drive, { backgroundColor: mode ? COLORS.red : COLORS.green }]}>
            <Text style={s.driveText}>{mode ? '■ End drive' : '▶ Start drive'}</Text>
          </Pressable>
        </View>
        {mode === 'foreground' && <Text style={s.note}>Foreground mode: keep RoadPals open. Use a development build for background tracking.</Text>}
      </SafeAreaView>

      <Toasts toasts={live.toasts} />

      <View style={s.controls}>
        <Pressable accessibilityLabel="Wave" onPress={live.wave} style={[s.big, { backgroundColor: waveBack ? COLORS.green : COLORS.cyan }]}>
          <Text style={s.bigIcon}>{me.profile.wave}</Text>
          <Text style={s.bigLabel}>{waveBack ? 'WAVE BACK' : 'WAVE'}</Text>
        </Pressable>
        <Pressable accessibilityLabel="Report" onPress={() => setPicker(picker === 'closed' ? 'report' : 'closed')} style={[s.big, { backgroundColor: COLORS.orange }]}>
          <Text style={s.bigIcon}>⚠️</Text>
          <Text style={s.bigLabel}>REPORT</Text>
        </Pressable>
      </View>
      {!follow && <Pressable style={s.recenter} onPress={() => setFollow(true)}><Text style={{ fontSize: 20 }}>◎</Text></Pressable>}

      {waveBack && live.incomingWave && (
        <View style={s.card}><Text style={{ fontSize: 28 }}>{live.incomingWave.emoji}</Text><View style={{ flex: 1 }}><Text style={s.cardTitle}>{live.incomingWave.name} waved at you</Text><Text style={s.cardSub}>Wave back within 5 seconds for a mutual wave</Text></View><Button title="Wave back" onPress={live.wave} /></View>
      )}

      {live.hazardPrompt && (
        <View style={s.card}>
          <Text style={{ fontSize: 28 }}>{HAZARDS[live.hazardPrompt.type].icon}</Text>
          <View style={{ flex: 1 }}><Text style={s.cardTitle}>{HAZARDS[live.hazardPrompt.type].label} ahead</Text><Text style={s.cardSub}>Reported by {live.hazardPrompt.reporterName}</Text></View>
          <Button title="Still there" onPress={() => vote(true)} style={{ paddingHorizontal: 10 }} />
          <Button title="Gone" kind="secondary" onPress={() => vote(false)} style={{ paddingHorizontal: 10 }} />
        </View>
      )}

      {pendingDest && (
        <View style={s.card}><Text style={{ fontSize: 26 }}>🏁</Text><Text style={[s.cardTitle, { flex: 1 }]}>Navigate here?</Text><Button title="Go" onPress={() => navigate(pendingDest)} /><Button title="Cancel" kind="secondary" onPress={() => setPendingDest(null)} /></View>
      )}
      {dest && !pendingDest && !live.hazardPrompt && !waveBack && (
        <View style={s.card}><Text style={{ fontSize: 22 }}>🧭</Text><Text style={[s.cardTitle, { flex: 1 }]}>Navigating · +10 on arrival, +8 if you don’t speed</Text><Button title="Cancel" kind="secondary" onPress={cancelTrip} /></View>
      )}

      {picker !== 'closed' && (
        <View style={s.sheet}>
          {picker === 'report' ? (<>
            <Text style={s.cardTitle}>What do you see?</Text>
            <View style={s.grid}>
              {(Object.keys(HAZARDS) as HazardType[]).map((k) => (
                <Pressable key={k} style={s.opt} onPress={() => report(k)}><Text style={{ fontSize: 26 }}>{HAZARDS[k].icon}</Text><Text style={s.optText}>{HAZARDS[k].label.split(' ')[0]}</Text></Pressable>
              ))}
              <Pressable style={[s.opt, { backgroundColor: '#f3e8ff' }]} onPress={() => setPicker('road')}><Text style={{ fontSize: 26 }}>✏️</Text><Text style={[s.optText, { color: '#6d28d9' }]}>Road name</Text></Pressable>
            </View>
          </>) : (<>
            <Text style={s.cardTitle}>Suggest a name for the road you’re on</Text>
            <TextInput value={roadName} onChangeText={setRoadName} placeholder="e.g. Maple St" style={s.input} autoFocus />
            <View style={{ flexDirection: 'row', gap: 8 }}><Button title="Submit" onPress={suggestRoad} style={{ flex: 1 }} /><Button title="Cancel" kind="secondary" onPress={() => setPicker('closed')} style={{ flex: 1 }} /></View>
          </>)}
        </View>
      )}
    </View>
  );
}

const shadow = { shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 6 };
const s = StyleSheet.create({
  top: { position: 'absolute', top: 0, left: 0, right: 0 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 12, paddingTop: 6 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.ink, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 9, ...shadow },
  pillText: { color: '#fff', fontWeight: '800' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  drive: { borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, ...shadow },
  driveText: { color: '#fff', fontWeight: '900' },
  note: { alignSelf: 'center', marginTop: 8, backgroundColor: 'rgba(31,42,55,0.8)', color: '#fff', fontSize: 12, fontWeight: '600', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, overflow: 'hidden' },
  controls: { position: 'absolute', left: 14, bottom: 24, gap: 12 },
  big: { width: 66, height: 66, borderRadius: 33, alignItems: 'center', justifyContent: 'center', ...shadow },
  bigIcon: { fontSize: 26 },
  bigLabel: { color: '#fff', fontSize: 9, fontWeight: '900', marginTop: 2 },
  recenter: { position: 'absolute', right: 14, bottom: 24, width: 46, height: 46, borderRadius: 14, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', ...shadow },
  card: { position: 'absolute', left: 96, right: 14, bottom: 24, backgroundColor: '#fff', borderRadius: 18, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 8, ...shadow },
  cardTitle: { fontWeight: '900', fontSize: 15, color: COLORS.ink },
  cardSub: { color: COLORS.muted, fontWeight: '600', fontSize: 12 },
  sheet: { position: 'absolute', left: 12, right: 12, bottom: 170, backgroundColor: '#fff', borderRadius: 18, padding: 14, gap: 10, ...shadow },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  opt: { width: '31%', alignItems: 'center', paddingVertical: 10, borderRadius: 14, backgroundColor: '#fff4e5' },
  optText: { fontSize: 11, fontWeight: '800', color: '#9a5b00', marginTop: 4 },
  input: { borderWidth: 1.5, borderColor: COLORS.line, borderRadius: 12, padding: 11, fontSize: 16 },
  place: { backgroundColor: '#fff', borderRadius: 8, borderWidth: 2, borderColor: COLORS.purple, padding: 3 },
  hazard: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 2.5, borderColor: '#c9c2b4', padding: 3 },
});
