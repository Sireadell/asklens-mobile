import React from 'react';
import { ActivityIndicator, Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import type { MemeReport } from '../lib/meme';
import { colors, radius, verdictStyle } from '../theme';

function Tile({ label, value, tone }: { label: string; value?: string; tone?: string }) {
  return (
    <View style={styles.tile}>
      <Text style={styles.tileLabel}>{label}</Text>
      <Text style={[styles.tileValue, tone ? { color: tone } : null]} numberOfLines={1}>
        {value ?? '...'}
      </Text>
    </View>
  );
}

const pct = (n: number | undefined, partial: boolean) => (n === undefined ? (partial ? '...' : 'n/a') : `${Math.round(n * 10) / 10}%`);

/** Verdict and sentence first, then the numbers. Fills in as facts arrive. */
export function MemeCard({ report, mint }: { report: MemeReport | null; mint: string }) {
  const r = report;
  const partial = r?.partial ?? true;
  const reading = !r || (partial && r.verdict === 'unknown');
  const v = verdictStyle[r?.verdict ?? 'unknown'];
  const heroColor = reading ? colors.cardHi : v.color;
  const heroText = reading ? colors.text : colors.bg;
  const change = r?.change5mText ?? '...';
  const changeTone = change.startsWith('+') ? colors.safe : change.startsWith('-') ? colors.danger : undefined;

  return (
    <View>
      <View style={styles.head}>
        {r?.imageUrl ? (
          <Image source={{ uri: r.imageUrl }} style={styles.img} />
        ) : (
          <View style={[styles.img, styles.imgFallback]}>
            <Text style={styles.imgLetter}>{(r?.symbol || r?.name || '?').slice(0, 1).toUpperCase()}</Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.name} numberOfLines={1}>
            {r?.name ?? 'Reading this coin...'}
          </Text>
          <Text style={styles.sym} numberOfLines={1}>
            {r?.symbol ? `${r.symbol}  ·  ` : ''}
            {r?.ageText ?? '...'}
          </Text>
        </View>
      </View>

      <View style={[styles.hero, { backgroundColor: heroColor }]}>
        {reading ? (
          <View style={styles.readingRow}>
            <ActivityIndicator color={colors.accent} />
            <Text style={[styles.heroTitle, { color: heroText, marginLeft: 12, fontSize: 22 }]}>Checking...</Text>
          </View>
        ) : (
          <Text style={[styles.heroTitle, { color: heroText }]}>
            {v.icon}  {v.title}
          </Text>
        )}
        <Text style={[styles.heroSentence, { color: heroText }]}>{r?.sentence ?? 'Reading the coin from live sources.'}</Text>
        {!!r && partial && !reading && <Text style={[styles.updating, { color: heroText }]}>Still adding facts...</Text>}
      </View>

      <View style={styles.grid}>
        <Tile label="Price" value={r?.priceText} />
        <Tile label="Last 5 min" value={change} tone={changeTone} />
        <Tile label="Money backing it" value={r?.liquidityText} />
        <Tile label="Holders" value={r?.holders === undefined ? (partial ? '...' : 'n/a') : r.holders.toLocaleString('en-US')} />
        <Tile label="Top holders own" value={pct(r?.topHoldersPct, partial)} />
        <Tile label="Creator holds" value={pct(r?.devPct, partial)} />
        <Tile label="Buying that looks real" value={pct(r?.realBuyingPct, partial)} />
        <Pressable style={styles.tile} onPress={() => Linking.openURL(r?.dexScreenerUrl ?? `https://dexscreener.com/solana/${mint}`)}>
          <Text style={styles.tileLabel}>More charts</Text>
          <Text style={[styles.tileValue, { color: colors.accent }]}>Open in DexScreener</Text>
        </Pressable>
      </View>

      {!!r?.reasons.length && (
        <View style={styles.box}>
          <Text style={styles.boxHead}>Details</Text>
          {r.reasons.map((t, i) => (
            <Text key={i} style={styles.reason}>
              {t}
            </Text>
          ))}
          <Text style={styles.foot}>No scam list covers Solana yet. These are facts from live public sources, not a safety stamp.</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  img: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.card },
  imgFallback: { alignItems: 'center', justifyContent: 'center' },
  imgLetter: { color: colors.accent, fontSize: 24, fontWeight: '800' },
  name: { color: colors.text, fontSize: 22, fontWeight: '800' },
  sym: { color: colors.dim, fontSize: 14, marginTop: 2 },
  hero: { borderRadius: 24, paddingVertical: 20, paddingHorizontal: 18, marginTop: 14 },
  readingRow: { flexDirection: 'row', alignItems: 'center' },
  heroTitle: { fontSize: 34, fontWeight: '800' },
  heroSentence: { fontSize: 17, fontWeight: '600', lineHeight: 24, marginTop: 6 },
  updating: { fontSize: 12, opacity: 0.7, marginTop: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  tile: { width: '48.5%', backgroundColor: colors.card, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 12 },
  tileLabel: { color: colors.dim, fontSize: 12, fontWeight: '600' },
  tileValue: { color: colors.text, fontSize: 17, fontWeight: '800', marginTop: 2 },
  box: { backgroundColor: colors.card, borderRadius: radius, padding: 16, marginTop: 12 },
  boxHead: { color: colors.dim, fontSize: 13, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 },
  reason: { color: colors.text, fontSize: 15, lineHeight: 22, marginBottom: 6 },
  foot: { color: colors.dim, fontSize: 12, marginTop: 6, lineHeight: 17 },
});
