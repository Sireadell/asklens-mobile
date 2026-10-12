import React, { useEffect, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Linking, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DarkTheme, NavigationContainer, NavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { ShareIntentProvider, useShareIntentContext } from 'expo-share-intent';
import HomeScreen from './src/screens/HomeScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import ResultScreen from './src/screens/ResultScreen';
import VerifyProofScreen from './src/screens/VerifyProofScreen';
import ScanScreen from './src/screens/ScanScreen';
import CheckupScreen from './src/screens/CheckupScreen';
import PairScreen from './src/screens/PairScreen';
import PcFeedScreen from './src/screens/PcFeedScreen';
import { feed } from './src/lib/pairing';
import { colors } from './src/theme';
import type { CheckResult } from './src/types';

export type RootStackParamList = {
  Tabs: undefined;
  Result: { text: string; saved?: CheckResult };
  VerifyProof: undefined;
  Scan: undefined;
  Pair: undefined;
  PcFeed: undefined;
};

// The wallet screen belongs to the Solana part of the app. If it is not in
// this build yet, the tab shows a short placeholder.
let WalletScreen: React.ComponentType = () => (
  <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
    <Text style={{ color: colors.dim, fontSize: 16 }}>Wallet is coming in this build.</Text>
  </View>
);
try {
  WalletScreen = require('./src/screens/WalletScreen').default;
} catch {}

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator();

const navTheme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: colors.bg, card: colors.card, border: colors.line, primary: colors.accent },
};

function Tabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.line, height: 64, paddingBottom: 8, paddingTop: 6 },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.dim,
        tabBarLabelStyle: { fontSize: 13, fontWeight: '700' },
      }}
    >
      <Tab.Screen name="Check" component={HomeScreen} options={{ tabBarIcon: () => null }} />
      <Tab.Screen name="History" component={HistoryScreen} options={{ tabBarIcon: () => null }} />
      <Tab.Screen name="Checkup" component={CheckupScreen} options={{ tabBarIcon: () => null }} />
      <Tab.Screen name="Wallet" component={WalletScreen} options={{ tabBarIcon: () => null }} />
    </Tab.Navigator>
  );
}

function Root() {
  const nav = useRef<NavigationContainerRef<RootStackParamList>>(null);
  const pending = useRef<string | null>(null);
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntentContext();

  // Something was shared into the app from another app: check it right away.
  useEffect(() => {
    if (!hasShareIntent) return;
    const t = shareIntent.webUrl ?? shareIntent.text;
    if (!t) return;
    if (nav.current?.isReady()) {
      nav.current.navigate('Result', { text: t });
      resetShareIntent();
    } else {
      pending.current = t;
    }
  }, [hasShareIntent, shareIntent, resetShareIntent]);

  // A link opened with "Open with AskLens" from another app: check it, never open it.
  useEffect(() => {
    const handle = (url: string | null) => {
      if (!url || !/^https?:\/\//i.test(url)) return;
      if (nav.current?.isReady()) nav.current.navigate('Result', { text: url });
      else pending.current = url;
    };
    Linking.getInitialURL().then(handle).catch(() => {});
    const sub = Linking.addEventListener('url', (e) => handle(e.url));
    return () => sub.remove();
  }, []);

  // Links copied on a linked PC: listen while the app is open, and open the feed when a notification is tapped.
  useEffect(() => {
    feed.start();
    let sub: { remove(): void } | null = null;
    try {
      const Notifications = require('expo-notifications');
      const open = (resp: any) => {
        const d = resp?.notification?.request?.content?.data;
        if (d && (d.pc || d.pairId || d.relay) && nav.current?.isReady()) nav.current.navigate('PcFeed');
      };
      sub = Notifications.addNotificationResponseReceivedListener(open);
    } catch {}
    return () => sub?.remove();
  }, []);

  return (
    <NavigationContainer
      ref={nav}
      theme={navTheme}
      onReady={() => {
        if (pending.current) {
          nav.current?.navigate('Result', { text: pending.current });
          pending.current = null;
          resetShareIntent();
        }
      }}
    >
      <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
        <Stack.Screen name="Tabs" component={Tabs} />
        <Stack.Screen name="Result" component={ResultScreen} options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="Scan" component={ScanScreen} options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="Pair" component={PairScreen} />
        <Stack.Screen name="PcFeed" component={PcFeedScreen} />
        <Stack.Screen
          name="VerifyProof"
          component={VerifyProofScreen}
          options={{ headerShown: true, title: 'Verify a proof', headerStyle: { backgroundColor: colors.card }, headerTintColor: colors.text }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ShareIntentProvider>
        <StatusBar style="light" />
        <Root />
      </ShareIntentProvider>
    </SafeAreaProvider>
  );
}
