import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { levelFor } from '@roadpals/shared';
import type { Me } from '@/lib/api';
import { COLORS } from '@/lib/config';
import type { Toast } from '@/lib/live';

export function Button({ title, onPress, kind = 'primary', disabled, loading, style }: { title: string; onPress: () => void; kind?: 'primary' | 'secondary' | 'danger' | 'dark'; disabled?: boolean; loading?: boolean; style?: ViewStyle }) {
  const bg = { primary: COLORS.cyan, secondary: '#eef1f4', danger: COLORS.red, dark: COLORS.ink }[kind];
  const fg = kind === 'secondary' ? COLORS.ink : '#fff';
  return (
    <Pressable accessibilityRole="button" onPress={onPress} disabled={disabled || loading}
      style={({ pressed }) => [ui.btn, { backgroundColor: bg, opacity: disabled ? 0.45 : pressed ? 0.8 : 1 }, style]}>
      {loading ? <ActivityIndicator color={fg} /> : <Text style={[ui.btnText, { color: fg }]}>{title}</Text>}
    </Pressable>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[ui.card, style]}>{children}</View>;
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <Text style={ui.section}>{children}</Text>;
}

/** Lifetime points (level) + spendable balance. */
export function ScoreBar({ me }: { me: Me }) {
  const lvl = levelFor(me.lifetimePoints);
  return (
    <View style={ui.score}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <View>
          <Text style={ui.scoreNum}>{me.lifetimePoints.toLocaleString()}<Text style={ui.scoreSmall}> lifetime pts</Text></Text>
          <Text style={ui.scoreLvl}>{lvl.level.icon} {lvl.level.name}{lvl.next ? ` · ${lvl.next.min - me.lifetimePoints} to ${lvl.next.name}` : ' · max level'}</Text>
        </View>
        <View style={ui.chip}><Text style={ui.chipText}>💰 {me.balance.toLocaleString()} to spend</Text></View>
      </View>
      <View style={ui.bar}><View style={[ui.barFill, { width: `${Math.round(lvl.progress * 100)}%` }]} /></View>
    </View>
  );
}

export function Toasts({ toasts }: { toasts: Toast[] }) {
  return (
    <View pointerEvents="none" style={ui.toasts}>
      {toasts.map((t) => (
        <View key={t.id} style={ui.toast}>
          <Text style={{ fontSize: 16 }}>{t.icon}</Text>
          <Text style={ui.toastText} numberOfLines={1}>{t.text}</Text>
          {t.points ? <View style={ui.pill}><Text style={ui.pillText}>+{t.points}</Text></View> : null}
        </View>
      ))}
    </View>
  );
}

export const ui = StyleSheet.create({
  btn: { borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontWeight: '800', fontSize: 15 },
  card: { backgroundColor: '#fff', borderRadius: 16, borderWidth: 1.5, borderColor: COLORS.line, padding: 14, marginHorizontal: 14, marginTop: 12 },
  section: { fontSize: 12, fontWeight: '900', color: COLORS.cyanDark, textTransform: 'uppercase', letterSpacing: 0.5, marginHorizontal: 16, marginTop: 18, marginBottom: 4 },
  score: { backgroundColor: COLORS.cyan, padding: 16 },
  scoreNum: { color: '#fff', fontSize: 34, fontWeight: '900' },
  scoreSmall: { fontSize: 14, fontWeight: '700' },
  scoreLvl: { color: '#fff', fontWeight: '800', marginTop: 2 },
  chip: { backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5 },
  chipText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  bar: { height: 8, backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: 6, marginTop: 10, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: '#fff' },
  toasts: { position: 'absolute', top: 110, left: 0, right: 0, alignItems: 'center', gap: 6 },
  toast: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderRadius: 22, paddingVertical: 7, paddingLeft: 10, paddingRight: 8, maxWidth: '90%', shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, elevation: 4 },
  toastText: { fontWeight: '700', fontSize: 14, color: COLORS.ink, flexShrink: 1 },
  pill: { backgroundColor: COLORS.green, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2 },
  pillText: { color: '#fff', fontWeight: '900' },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#f1f3f5', gap: 10 },
  muted: { color: COLORS.muted, fontWeight: '600', fontSize: 12 },
  input: { borderWidth: 1.5, borderColor: COLORS.line, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, fontSize: 16, fontWeight: '600', color: COLORS.ink, backgroundColor: '#fff' },
});
