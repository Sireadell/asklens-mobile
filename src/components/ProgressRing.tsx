import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { colors } from '../theme';

/** Ring that fills as today's checks reach the daily goal. */
export function ProgressRing({ done, goal, size = 150 }: { done: number; goal: number; size?: number }) {
  const stroke = 14;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.min(1, goal > 0 ? done / goal : 0);
  const met = done >= goal;
  const color = met ? colors.safe : colors.accent;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.line} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${c * pct} ${c}`}
          rotation={-90}
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
      <Text style={[styles.big, { color }]}>
        {Math.min(done, goal)}/{goal}
      </Text>
      <Text style={styles.small}>{met ? 'Goal done' : 'today'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  big: { fontSize: 36, fontWeight: '800' },
  small: { color: colors.dim, fontSize: 13, marginTop: -2 },
});
