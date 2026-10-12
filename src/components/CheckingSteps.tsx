import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';

/** Three steps that tick off one by one while a check runs. */
export function CheckingSteps({ steps, input }: { steps: string[]; input: string }) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    // Moves on every 1.4 s and waits on the last step until the answer arrives.
    const t = setInterval(() => setActive((a) => Math.min(a + 1, steps.length - 1)), 1400);
    return () => clearInterval(t);
  }, [steps.length]);

  return (
    <View style={styles.wrap}>
      <Text style={styles.input} numberOfLines={1}>
        {input}
      </Text>
      {steps.map((s, i) => (
        <Step key={s} label={s} state={i < active ? 'done' : i === active ? 'now' : 'wait'} />
      ))}
    </View>
  );
}

function Step({ label, state }: { label: string; state: 'done' | 'now' | 'wait' }) {
  const pulse = useRef(new Animated.Value(0.35)).current;
  useEffect(() => {
    if (state !== 'now') return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.35, duration: 600, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [state, pulse]);

  return (
    <View style={styles.row}>
      <Animated.View
        style={[
          styles.dot,
          state === 'done' && { backgroundColor: colors.safe, borderColor: colors.safe },
          state === 'now' && { borderColor: colors.accent, opacity: pulse },
        ]}
      >
        {state === 'done' && <Text style={styles.tick}>✓</Text>}
      </Animated.View>
      <Text style={[styles.label, state === 'wait' && { color: colors.dim }, state === 'now' && { color: colors.text, fontWeight: '800' }]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', maxWidth: 360, alignSelf: 'center' },
  input: { color: colors.dim, fontSize: 14, textAlign: 'center', marginBottom: 28 },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 18 },
  dot: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  tick: { color: colors.bg, fontWeight: '800', fontSize: 15 },
  label: { color: colors.text, fontSize: 18, marginLeft: 14 },
});
