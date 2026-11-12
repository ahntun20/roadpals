import { Redirect } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { Text } from 'react-native';
import { COLORS } from '@/lib/config';
import { useSession } from '@/lib/session';

const icon = (emoji: string) => ({ focused }: { focused: boolean }) => <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.5 }}>{emoji}</Text>;

export default function TabLayout() {
  const { me } = useSession();
  if (!me) return <Redirect href="/sign-in" />;
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: COLORS.ink, tabBarLabelStyle: { fontWeight: '800' } }}>
      <Tabs.Screen name="index" options={{ title: 'Map', tabBarIcon: icon('🗺️') }} />
      <Tabs.Screen name="activity" options={{ title: 'Activity', tabBarIcon: icon('⚡') }} />
      <Tabs.Screen name="board" options={{ title: 'Board', tabBarIcon: icon('🏆') }} />
      <Tabs.Screen name="shop" options={{ title: 'Shop', tabBarIcon: icon('🛍️') }} />
      <Tabs.Screen name="me" options={{ title: 'Me', tabBarIcon: icon('🙂') }} />
    </Tabs>
  );
}
