import React, { useCallback, useState } from 'react';
import { FlatList, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { clearHistory, loadHistory } from '../lib/store';
import { loadProofLinks } from '../lib/solanaBridge';
import { shortInput } from '../components/ShareCard';
import { colors, radius, verdictStyle } from '../theme';
import type { CheckResult } from '../types';

function ago(t: number): string {
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

export default function HistoryScreen() {
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<CheckResult[]>([]);
  const [proofs, setProofs] = useState<Record<string, string>>({});

  useFocusEffect(
    useCallback(() => {
      loadHistory().then(setItems);
      loadProofLinks().then(setProofs);
    }, [])
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top + 16 }}>
      <View style={styles.head}>
        <Text style={styles.title}>History</Text>
        {items.length > 0 && (
          <Pressable
            onPress={async () => {
              await clearHistory();
              setItems([]);
            }}
          >
            <Text style={styles.clear}>Clear</Text>
          </Pressable>
        )}
      </View>
      <Pressable style={styles.verify} onPress={() => nav.navigate('VerifyProof')}>
        <Text style={styles.verifyText}>Verify a proof</Text>
        <Text style={styles.verifySub}>Look up a saved proof on Solana</Text>
      </Pressable>
      <FlatList
        data={items}
        keyExtractor={(i) => `${i.checkedAt}-${i.input}`}
        contentContainerStyle={{ padding: 20, paddingTop: 8 }}
        ListEmptyComponent={<Text style={styles.empty}>Nothing checked yet. Your checks show up here.</Text>}
        renderItem={({ item }) => {
          const v = verdictStyle[item.verdict];
          return (
            <Pressable
              style={styles.row}
              onPress={() => nav.navigate('Result', { text: item.input, saved: item })}
            >
              <View style={[styles.dot, { backgroundColor: v.color }]}>
                <Text style={styles.dotText}>{v.icon}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.input} numberOfLines={1}>
                  {shortInput(item.input, 38)}
                </Text>
                <Text style={styles.meta}>
                  {v.title} · {ago(item.checkedAt)}
                </Text>
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20 },
  title: { color: colors.text, fontSize: 30, fontWeight: '800' },
  clear: { color: colors.accent, fontSize: 16, fontWeight: '700' },
  verify: { backgroundColor: colors.card, borderRadius: radius, padding: 14, marginHorizontal: 20, marginTop: 12 },
  verifyText: { color: colors.accent, fontSize: 16, fontWeight: '800' },
  verifySub: { color: colors.dim, fontSize: 13, marginTop: 2 },
  empty: { color: colors.dim, textAlign: 'center', marginTop: 60, fontSize: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.card, borderRadius: radius, padding: 14, marginBottom: 10 },
  dot: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  dotText: { color: colors.bg, fontSize: 20, fontWeight: '800' },
  input: { color: colors.text, fontSize: 15, fontWeight: '600' },
  proofLink: { color: colors.accent, fontSize: 13, fontWeight: '700', marginTop: 4 },
  meta: { color: colors.dim, fontSize: 13, marginTop: 2 },
});
