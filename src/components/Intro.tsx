import React, { useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius } from '../theme';

const CARDS = [
  { icon: '↗', title: 'Share it in', body: 'See a link or wallet address in Telegram, X or your browser? Tap Share and pick AskLens Guard.' },
  { icon: '●', title: 'Get a colour', body: 'Green, amber or red in seconds, with the reasons in plain words. Nothing is opened for you.' },
  { icon: '✓', title: 'Save proof', body: 'Keep a record on Solana that you checked before you tapped. Your wallet signs it, only if you say yes.' },
];

export default function Intro({ onDone, onDemo }: { onDone: () => void; onDemo: () => void }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [page, setPage] = useState(0);
  const list = useRef<FlatList>(null);
  const last = page === CARDS.length - 1;

  const next = () => {
    Haptics.selectionAsync().catch(() => {});
    if (last) return;
    list.current?.scrollToIndex({ index: page + 1, animated: true });
    setPage(page + 1);
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + 24 }]}>
      <Text style={styles.brand}>AskLens Guard</Text>
      <FlatList
        ref={list}
        data={CARDS}
        keyExtractor={(c) => c.title}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
        renderItem={({ item }) => (
          <View style={[styles.card, { width }]}>
            <Text style={styles.icon}>{item.icon}</Text>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.body}>{item.body}</Text>
          </View>
        )}
      />
      <View style={styles.dots}>
        {CARDS.map((c, i) => (
          <View key={c.title} style={[styles.dot, i === page && { backgroundColor: colors.accent, width: 22 }]} />
        ))}
      </View>
      <View style={{ paddingHorizontal: 24, paddingBottom: insets.bottom + 24 }}>
        {last ? (
          <>
            <Pressable style={styles.danger} onPress={onDemo}>
              <Text style={styles.dangerText}>Try the scam demo</Text>
              <Text style={styles.dangerSub}>Checks a known-bad link. It is never opened.</Text>
            </Pressable>
            <Pressable style={styles.skip} onPress={onDone}>
              <Text style={styles.skipText}>Get started</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Pressable style={styles.primary} onPress={next}>
              <Text style={styles.primaryText}>Next</Text>
            </Pressable>
            <Pressable style={styles.skip} onPress={onDone}>
              <Text style={styles.skipText}>Skip</Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  brand: { color: colors.accent, fontSize: 14, letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: '700', paddingHorizontal: 24 },
  card: { paddingHorizontal: 24, paddingTop: 60 },
  icon: { color: colors.accent, fontSize: 64, fontWeight: '800' },
  title: { color: colors.text, fontSize: 38, fontWeight: '800', marginTop: 16 },
  body: { color: colors.dim, fontSize: 18, lineHeight: 26, marginTop: 12 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 20 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.line },
  primary: { backgroundColor: colors.accent, borderRadius: radius, paddingVertical: 17, alignItems: 'center' },
  primaryText: { color: colors.bg, fontSize: 18, fontWeight: '800' },
  danger: { borderWidth: 1, borderColor: colors.danger, borderRadius: radius, paddingVertical: 16, alignItems: 'center' },
  dangerText: { color: colors.danger, fontSize: 18, fontWeight: '800' },
  dangerSub: { color: colors.dim, fontSize: 12, marginTop: 2 },
  skip: { paddingVertical: 14, alignItems: 'center', marginTop: 6 },
  skipText: { color: colors.dim, fontSize: 16, fontWeight: '700' },
});
