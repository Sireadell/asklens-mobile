import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { enablePush, feed, loadPairing, PushState, unlink } from '../lib/pairing';
import { shortInput } from '../components/ShareCard';
import { colors, radius, verdictStyle } from '../theme';
import type { RootStackParamList } from '../../App';

type Props = NativeStackScreenProps<RootStackParamList, 'PcFeed'>;

const STATUS_LINE: Record<string, string> = {
  off: 'Not listening.',
  connecting: 'Connecting to your PC...',
  live: 'PC linked, live. Copy a link on your PC and it shows up here.',
  offline: 'No connection right now. Trying again...',
  paused: 'Paused while the app is in the background.',
  expired: 'The link to your PC has run out. Link it again.',
};

export default function PcFeedScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [, bump] = useState(0);
  const [push, setPush] = useState<PushState | 'unknown'>('unknown');

  useEffect(() => {
    feed.start();
    return feed.subscribe(() => bump((n) => n + 1));
  }, []);

  const turnOnNotifications = async () => {
    const p = await loadPairing();
    if (p) setPush(await enablePush(p));
  };

  const doUnlink = () =>
    Alert.alert('Unlink your PC?', 'Links you copy on your PC will stop showing up here.', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Unlink',
        style: 'destructive',
        onPress: async () => {
          await unlink();
          navigation.goBack();
        },
      },
    ]);

  const live = feed.status === 'live' || feed.status === 'connecting';
  const dot = feed.status === 'live' ? colors.safe : feed.status === 'offline' || feed.status === 'expired' ? colors.danger : colors.caution;

  return (
    <ScrollView
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: 20, paddingTop: insets.top + 16, paddingBottom: insets.bottom + 30 }}
    >
      <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
        <Text style={styles.back}>Back</Text>
      </Pressable>
      <Text style={styles.title}>From your PC</Text>
      <View style={styles.statusRow}>
        <View style={[styles.dot, { backgroundColor: dot }]} />
        <Text style={styles.status}>{STATUS_LINE[feed.status]}</Text>
      </View>
      {feed.status === 'expired' && (
        <Pressable style={styles.primary} onPress={() => navigation.replace('Pair')}>
          <Text style={styles.primaryText}>Link again</Text>
        </Pressable>
      )}

      {push !== 'on' && (
        <Pressable style={styles.note} onPress={turnOnNotifications}>
          <Text style={styles.noteTitle}>
            {push === 'unknown' ? 'Notifications' : push === 'denied' ? 'Notifications are off' : 'Notifications are off'}
          </Text>
          <Text style={styles.noteText}>
            {push === 'unavailable'
              ? 'Notifications are off: only checks while the app is open.'
              : push === 'denied'
              ? 'You said no to notifications, so this only checks while the app is open. You can allow them in phone settings.'
              : 'Tap to get a notification when the app is closed. Until then it only checks while the app is open.'}
          </Text>
        </Pressable>
      )}

      {feed.items.length === 0 && feed.status !== 'expired' && (
        <Text style={styles.empty}>Nothing yet. Copy a link or wallet address on your PC.</Text>
      )}

      {feed.items.map((it) => {
        const v = it.result ? verdictStyle[it.result.verdict] : null;
        return (
          <Pressable
            key={it.id}
            style={[styles.item, v && { borderLeftColor: v.color }]}
            onPress={() => it.result && navigation.navigate('Result', { text: it.text, saved: it.result })}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.itemText} numberOfLines={2}>
                {shortInput(it.text, 60)}
              </Text>
              <Text style={styles.itemTag}>from your PC</Text>
            </View>
            {v ? (
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[styles.verdict, { color: v.color }]}>{v.icon} {v.title}</Text>
                <Text style={styles.tap}>Tap for details</Text>
              </View>
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <ActivityIndicator color={colors.accent} />
                <Text style={styles.tap}>Checking...</Text>
              </View>
            )}
          </Pressable>
        );
      })}

      <Pressable style={styles.unlink} onPress={doUnlink}>
        <Text style={styles.unlinkText}>Unlink this PC</Text>
      </Pressable>
      <Text style={styles.fine}>Only links and wallet addresses you copy on your PC are sent. The link service forgets them after 10 minutes.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  back: { color: colors.accent, fontSize: 16, fontWeight: '700' },
  title: { color: colors.text, fontSize: 32, fontWeight: '800', marginTop: 14 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  status: { color: colors.dim, fontSize: 15, lineHeight: 21, flex: 1 },
  primary: { backgroundColor: colors.accent, borderRadius: radius, paddingVertical: 15, alignItems: 'center', marginTop: 14 },
  primaryText: { color: colors.bg, fontSize: 17, fontWeight: '800' },
  note: { backgroundColor: colors.card, borderRadius: radius, padding: 14, marginTop: 16 },
  noteTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
  noteText: { color: colors.dim, fontSize: 14, lineHeight: 20, marginTop: 4 },
  empty: { color: colors.dim, fontSize: 15, textAlign: 'center', marginTop: 40 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.card,
    borderRadius: radius,
    borderLeftWidth: 5,
    borderLeftColor: colors.line,
    padding: 14,
    marginTop: 12,
  },
  itemText: { color: colors.text, fontSize: 15, fontWeight: '600' },
  itemTag: { color: colors.accent, fontSize: 12, fontWeight: '700', marginTop: 4 },
  verdict: { fontSize: 15, fontWeight: '800' },
  tap: { color: colors.dim, fontSize: 12, marginTop: 2 },
  unlink: { borderWidth: 1, borderColor: colors.line, borderRadius: radius, paddingVertical: 14, alignItems: 'center', marginTop: 32 },
  unlinkText: { color: colors.dim, fontSize: 15, fontWeight: '700' },
  fine: { color: colors.dim, fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 12 },
});
