import { Platform } from 'react-native';

export const OrTrackColors = {
  background: '#1A1A2E',
  gold: '#C9A84C',
  white: '#FFFFFF',
  accent: '#F5E6A3',
  tabBar: '#12122A',
  tabIconDefault: '#6B6B8A',
  card: '#252540',
  border: '#2E2E4A',
  subtext: '#8888A0',
};

export const Colors = {
  light: {
    text: '#FFFFFF',
    background: '#1A1A2E',
    tint: '#C9A84C',
    icon: '#C9A84C',
    tabIconDefault: '#6B6B8A',
    tabIconSelected: '#C9A84C',
  },
  dark: {
    text: '#FFFFFF',
    background: '#1A1A2E',
    tint: '#C9A84C',
    icon: '#C9A84C',
    tabIconDefault: '#6B6B8A',
    tabIconSelected: '#C9A84C',
  },
};

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
