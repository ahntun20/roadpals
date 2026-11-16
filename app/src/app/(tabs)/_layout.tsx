import { Redirect } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { Text } from 'react-native';
import { COLORS } from '@/lib/config';
import { useSession } from '@/lib/session';

function TabIcon({ emoji, focused }: { emoji: string; focused: boolean }) {
  return <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.5 }}>{emoji}</Text>;
}

export default function TabLayout() {
  const { me } = useSession();
  if (!me) return <Redirect href="/sign-in" />;
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: COLORS.ink, tabBarLabelStyle: { fontWeight: '800' } }}>
      <Tabs.Screen name="index" options={{ title: 'Map', tabBarIcon: ({ focused }) => <TabIcon emoji="🗺️" focused={focused} /> }} />
      <Tabs.Screen name="activity" options={{ title: 'Activity', tabBarIcon: ({ focused }) => <TabIcon emoji="⚡" focused={focused} /> }} />
      <Tabs.Screen name="board" options={{ title: 'Board', tabBarIcon: ({ focused }) => <TabIcon emoji="🏆" focused={focused} /> }} />
      <Tabs.Screen name="shop" options={{ title: 'Shop', tabBarIcon: ({ focused }) => <TabIcon emoji="🛍️" focused={focused} /> }} />
      <Tabs.Screen name="me" options={{ title: 'Me', tabBarIcon: ({ focused }) => <TabIcon emoji="🙂" focused={focused} /> }} />
    </Tabs>
  );
}
