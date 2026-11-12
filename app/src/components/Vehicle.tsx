/**
 * Tiny top-down vehicles drawn with Views (pointing up = north). Rotate them with the
 * map Marker's `rotation` prop. Every brand uses one fixed colour (see shared/vehicles).
 */
import { StyleSheet, View } from 'react-native';
import type { VehicleType } from '@roadpals/shared';

const GLASS = 'rgba(20,30,45,0.75)';

export function Vehicle({ type, color, scale = 1, me = false, rainbow = false }: { type: VehicleType; color: string; scale?: number; me?: boolean; rainbow?: boolean }) {
  const s = scale * (me ? 1.4 : 1);
  if (type === 'bus') {
    return (
      <View style={[st.body, { width: 12 * s, height: 34 * s, backgroundColor: color, borderRadius: 3 * s }]}>
        <View style={[st.glass, { top: 2 * s, height: 3 * s, left: 2 * s, right: 2 * s }]} />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <View key={i} style={{ position: 'absolute', top: (8 + i * 4) * s, left: 1 * s, right: 1 * s, height: 2 * s, flexDirection: 'row', justifyContent: 'space-between' }}>
            <View style={{ width: 1.5 * s, height: 2.5 * s, backgroundColor: 'rgba(255,255,255,0.85)' }} />
            <View style={{ width: 1.5 * s, height: 2.5 * s, backgroundColor: 'rgba(255,255,255,0.85)' }} />
          </View>
        ))}
      </View>
    );
  }
  if (type === 'truck' || type === 'container') {
    const long = type === 'container';
    return (
      <View style={{ alignItems: 'center' }}>
        <View style={[st.body, { width: 10 * s, height: 8 * s, backgroundColor: long ? '#e5e7eb' : color, borderRadius: 2.5 * s }]}>
          <View style={[st.glass, { top: 1.5 * s, height: 2.2 * s, left: 1.5 * s, right: 1.5 * s }]} />
        </View>
        <View style={{ height: 1.5 * s, width: 2 * s, backgroundColor: '#334155' }} />
        <View style={[st.body, { width: 12 * s, height: (long ? 30 : 20) * s, backgroundColor: long ? color : '#f1f5f9', borderRadius: 1.5 * s }]}>
          {long
            ? Array.from({ length: 8 }).map((_, i) => <View key={i} style={{ position: 'absolute', top: (2 + i * 3.5) * s, left: 1, right: 1, height: StyleSheet.hairlineWidth * 2, backgroundColor: 'rgba(0,0,0,0.22)' }} />)
            : <View style={{ position: 'absolute', left: 4.8 * s, width: 2.4 * s, top: 0, bottom: 0, backgroundColor: color }} />}
        </View>
      </View>
    );
  }
  // car + taxi
  const w = 10 * s, h = 18 * s;
  return (
    <View style={[st.body, { width: w, height: h, backgroundColor: rainbow ? '#a855f7' : color, borderRadius: 3.5 * s }]}>
      {rainbow && ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6'].map((c, i) => (
        <View key={c} style={{ position: 'absolute', left: 0, right: 0, top: (i * h) / 5, height: h / 5, backgroundColor: c }} />
      ))}
      <View style={[st.glass, { top: 3 * s, height: 3.2 * s, left: 1.6 * s, right: 1.6 * s }]} />
      <View style={[st.glass, { bottom: 2 * s, height: 2.2 * s, left: 1.8 * s, right: 1.8 * s }]} />
      {type === 'taxi' && <View style={{ position: 'absolute', top: 7.5 * s, left: 2.8 * s, width: 4.4 * s, height: 3.4 * s, backgroundColor: '#111827', alignItems: 'center', justifyContent: 'center' }}><View style={{ width: 3 * s, height: 2.2 * s, backgroundColor: '#fde047' }} /></View>}
      <View style={[st.light, { top: 0.5 * s, left: 1 * s, width: 1.8 * s, height: 1.2 * s, backgroundColor: '#fff7c2' }]} />
      <View style={[st.light, { top: 0.5 * s, right: 1 * s, width: 1.8 * s, height: 1.2 * s, backgroundColor: '#fff7c2' }]} />
      <View style={[st.light, { bottom: 0.4 * s, left: 1 * s, width: 1.6 * s, height: 1 * s, backgroundColor: '#ef4444' }]} />
      <View style={[st.light, { bottom: 0.4 * s, right: 1 * s, width: 1.6 * s, height: 1 * s, backgroundColor: '#ef4444' }]} />
    </View>
  );
}

const st = StyleSheet.create({
  body: { borderWidth: 1.2, borderColor: '#fff', overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 3 },
  glass: { position: 'absolute', backgroundColor: GLASS, borderRadius: 1 },
  light: { position: 'absolute' },
});
