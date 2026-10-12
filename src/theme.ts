import type { Verdict } from './types';

export const colors = {
  bg: '#0B0F14',
  card: '#141B24',
  cardHi: '#1B2531',
  line: '#26323F',
  text: '#F2F5F8',
  dim: '#8A97A6',
  accent: '#5BC0FF',
  safe: '#1FD17A',
  caution: '#FFB020',
  danger: '#FF4D57',
  unknown: '#7B8794',
};

export const verdictStyle: Record<Verdict, { color: string; title: string; sub: string; icon: string }> = {
  safe: { color: colors.safe, title: 'Looks safe', sub: 'Nothing bad found.', icon: '✓' },
  caution: { color: colors.caution, title: 'Be careful', sub: 'Something looks off.', icon: '!' },
  danger: { color: colors.danger, title: 'Do not open', sub: 'This is flagged as dangerous.', icon: '✕' },
  unknown: { color: colors.unknown, title: 'Not sure', sub: 'We could not get a clear answer.', icon: '?' },
};

export const radius = 18;
