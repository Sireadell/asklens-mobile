import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { CheckResult, Verdict } from '../types';
import { colors, verdictStyle } from '../theme';

export function shortInput(s: string, n = 44): string {
  return s.length > n ? `${s.slice(0, n - 12)}...${s.slice(-9)}` : s;
}

// One short, plain sentence per answer. Written to be read by someone who
// sees the picture in a group chat with no other context.
const SENTENCE: Record<Verdict, string> = {
  safe: 'I checked it first. Nothing bad turned up.',
  caution: 'I checked it first. Something looked off, so I held back.',
  danger: 'I checked it first. It is flagged as dangerous, so I did not open it.',
  unknown: 'I checked it first. There was no clear answer, so I am not trusting it yet.',
};

/** The picture people share. Drawn as a plain view so it can be captured. */
export const ShareCard = React.forwardRef<View, { result: CheckResult; holder?: boolean }>(({ result, holder }, ref) => {
  const v = verdictStyle[result.verdict];
  return (
    <View ref={ref} collapsable={false} style={styles.card}>
      <View style={[styles.hero, { backgroundColor: v.color }]}>
        <Text style={styles.icon}>{v.icon}</Text>
        <Text style={styles.title}>{v.title}</Text>
      </View>
      <Text style={styles.sentence}>{SENTENCE[result.verdict]}</Text>
      <Text style={styles.input}>{shortInput(result.input, 36)}</Text>
      <View style={styles.footer}>
        <Text style={styles.brand}>AskLens Guard</Text>
        {!!holder && (
          <View style={styles.holder}>
            <Text style={styles.holderText}>SKR HOLDER</Text>
          </View>
        )}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: { width: 340, backgroundColor: colors.bg, borderRadius: 28, padding: 18 },
  hero: { borderRadius: 22, alignItems: 'center', paddingVertical: 34 },
  icon: { fontSize: 84, fontWeight: '800', color: colors.bg, lineHeight: 92 },
  title: { fontSize: 38, fontWeight: '800', color: colors.bg, marginTop: 2 },
  sentence: { color: colors.text, fontSize: 19, fontWeight: '600', lineHeight: 26, textAlign: 'center', marginTop: 22, paddingHorizontal: 6 },
  input: { color: colors.dim, fontSize: 14, textAlign: 'center', marginTop: 12 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 24 },
  brand: { color: colors.accent, fontSize: 14, letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: '800' },
  holder: { borderWidth: 1.5, borderColor: colors.accent, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  holderText: { color: colors.accent, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
});
