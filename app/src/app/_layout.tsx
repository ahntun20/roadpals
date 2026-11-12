import '@/lib/background'; // registers the background GPS task at module scope
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LiveProvider } from '@/lib/live';
import { SessionProvider, useSession } from '@/lib/session';
import { COLORS } from '@/lib/config';

function Gate() {
  const { ready } = useSession();
  if (!ready) {
    return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={COLORS.cyan} size="large" /></View>;
  }
  return (
    <LiveProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="sign-in" />
      </Stack>
    </LiveProvider>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <StatusBar style="dark" />
        <Gate />
      </SessionProvider>
    </SafeAreaProvider>
  );
}
