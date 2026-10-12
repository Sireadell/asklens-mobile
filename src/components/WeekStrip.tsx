import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { DayCell } from '../lib/guard';
import { colors } from '../theme';

/** Seven small circles: filled when you checked something that day. */
export function WeekStrip({ days, goal }: { days: DayCell[]; goal: number }) {
  return (
    <View style={styles.row}>
      {days.map((d) => {
        const hit = d.count >= goal;
        const some = d.count > 0;
        return (
          <View key={d.key} style={styles.cell}>
            <View
              style={[
                styles.dot,
                some && { backgroundColor: hit ? colors.safe : colors.accent, borderColor: 'transparent' },
                d.isToday && !some && { borderColor: colors.accent },
              ]}
            >
              <Text style={[styles.count, some && { color: colors.bg }]}>{some ? d.count : ''}</Text>
            </View>
            <Text style={[styles.label, d.isToday && { color: colors.text }]}>{d.label}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14 },
  cell: { alignItems: 'center', flex: 1 },
  dot: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 2,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  count: { color: colors.dim, fontWeight: '800', fontSize: 15 },
  label: { color: colors.dim, fontSize: 12, marginTop: 6, fontWeight: '700' },
});
