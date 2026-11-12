import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COSMETIC_KINDS, SHOP_ITEMS, type ShopItem } from '@roadpals/shared';
import { api, type Coupon } from '@/lib/api';
import { COLORS } from '@/lib/config';
import { useLive } from '@/lib/live';
import { useSession } from '@/lib/session';
import { Card, SectionTitle, ui } from '@/components/ui';

const sections = [...new Set(SHOP_ITEMS.map((i) => i.section))];

export default function Shop() {
  const { me, setMe } = useSession();
  const live = useLive();
  const [busy, setBusy] = useState<string | null>(null);
  const [coupons, setCoupons] = useState<Coupon[]>([]);

  const loadCoupons = useCallback(() => api.coupons().then((r) => setCoupons(r.coupons)).catch(() => {}), []);
  useEffect(() => { void loadCoupons(); }, [loadCoupons]);
  if (!me) return null;

  const equippedId = (i: ShopItem) => me.equipped[i.kind as 'skin' | 'wave' | 'theme'];

  const tap = async (item: ShopItem) => {
    setBusy(item.id);
    try {
      const owned = item.cost === 0 || me.inventory.includes(item.id);
      if (COSMETIC_KINDS.includes(item.kind) && owned) setMe((await api.equip(item.id)).me);
      else {
        const r = await api.buy(item.id);
        setMe(r.me);
        live.toast(item.icon, r.message);
        if (item.kind === 'coupon') void loadCoupons();
      }
    } catch (e) {
      live.toast('⚠️', (e as Error).message);
    } finally { setBusy(null); }
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 30 }}>
        <Card>
          <Text style={{ fontSize: 22, fontWeight: '900' }}>💰 {me.balance.toLocaleString()} pts to spend</Text>
          <Text style={ui.muted}>Spending never lowers your level — levels use lifetime points ({me.lifetimePoints.toLocaleString()}).</Text>
          {me.boosts.doubleMsLeft > 0 && <Text style={{ marginTop: 6, fontWeight: '800' }}>⚡ Double points · {Math.ceil(me.boosts.doubleMsLeft / 60000)} min left</Text>}
          {me.boosts.radiusMsLeft > 0 && <Text style={{ fontWeight: '800' }}>📡 Bigger pass radius · {Math.ceil(me.boosts.radiusMsLeft / 3600000)} h left</Text>}
          {me.stats.freezes > 0 && <Text style={{ fontWeight: '800' }}>🧊 {me.stats.freezes} streak freeze{me.stats.freezes > 1 ? 's' : ''} saved</Text>}
        </Card>

        {coupons.length > 0 && (<>
          <SectionTitle>Your coupons</SectionTitle>
          {coupons.map((c) => (
            <Card key={c.id} style={{ borderStyle: 'dashed', borderColor: COLORS.green }}>
              <Text style={{ fontWeight: '800' }}>🎟️ {c.name}</Text>
              <Text style={ui.muted}>{c.code ? `Show code: ${c.code}` : `Ready on ${new Date(c.readyAt).toDateString()} (held for fraud checks)`}</Text>
            </Card>
          ))}
        </>)}

        {sections.map((sec) => (
          <View key={sec}>
            <SectionTitle>{sec}</SectionTitle>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 10 }}>
              {SHOP_ITEMS.filter((i) => i.section === sec).map((item) => {
                const cosmetic = COSMETIC_KINDS.includes(item.kind);
                const owned = item.cost === 0 || me.inventory.includes(item.id);
                const equipped = cosmetic && equippedId(item) === item.id;
                const locked = item.minKm != null && me.stats.legalKm < item.minKm;
                const label = equipped ? 'Equipped' : cosmetic && owned ? 'Equip' : locked ? `🔒 ${item.minKm} km` : `${cosmetic ? 'Buy' : 'Redeem'} · ${item.cost.toLocaleString()}`;
                const disabled = equipped || locked || (!owned && me.balance < item.cost) || busy === item.id;
                return (
                  <View key={item.id} style={{ width: '50%', padding: 4 }}>
                    <View style={{ backgroundColor: '#fff', borderRadius: 14, borderWidth: 1.5, borderColor: equipped ? COLORS.cyan : COLORS.line, padding: 10, gap: 4, minHeight: 150 }}>
                      <View style={{ height: 40, borderRadius: 10, backgroundColor: COLORS.bg, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 24 }}>{item.icon}</Text></View>
                      <Text style={{ fontWeight: '800' }}>{item.name}</Text>
                      <Text style={[ui.muted, { flex: 1 }]}>{item.description}</Text>
                      <Pressable disabled={disabled} onPress={() => tap(item)} style={{ borderRadius: 10, paddingVertical: 8, alignItems: 'center', backgroundColor: equipped ? COLORS.cyan : disabled ? '#e5e7eb' : cosmetic && owned ? '#eef1f4' : COLORS.ink }}>
                        <Text style={{ fontWeight: '800', fontSize: 12, color: equipped ? '#fff' : disabled ? '#9ca3af' : cosmetic && owned ? COLORS.ink : '#fff' }}>{label}</Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
