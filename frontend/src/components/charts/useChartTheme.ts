import { useMemo } from 'react';
import { useTheme } from '@/context/ThemeContext';

/**
 * Chart tokens per theme (mirrors the CSS custom properties in index.css).
 * Kept as a static map so SVG marks switch in the same render as the theme toggle.
 * Categorical slots are the validated reference palette (blue, orange, aqua), stepped per mode.
 */
const TOKENS = {
  light: {
    surface: '#ffffff',
    grid: '#e8e8e3',
    axis: '#c3c2b7',
    muted: '#898781',
    ink: '#101828',
    ink2: '#475467',
    series: ['#2a78d6', '#eb6834', '#1baf7a'] as const,
  },
  dark: {
    surface: '#14171c',
    grid: '#2c2c2a',
    axis: '#383835',
    muted: '#898781',
    ink: '#f0f2f5',
    ink2: '#b4bccb',
    series: ['#3987e5', '#d95926', '#199e70'] as const,
  },
};

export function useChartTheme() {
  const { theme } = useTheme();
  return useMemo(() => ({ theme, ...TOKENS[theme] }), [theme]);
}
