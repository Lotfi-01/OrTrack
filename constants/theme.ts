import { Platform } from 'react-native';

export const OrTrackColors = {
  background: '#12110F',
  gold: '#C9A84C',
  white: '#F5F0E8',
  accent: '#F5E6A3',
  tabBar: '#161410',
  tabIconDefault: '#6B6060',
  card: '#1C1A17',
  border: '#2A2620',
  subtext: '#7A7060',
  label: '#8A806A',
  goldBadge: 'rgba(201,168,76,0.12)',
};

export const Colors = {
  light: {
    text: '#FFFFFF',
    background: '#12110F',
    tint: '#C9A84C',
    icon: '#C9A84C',
    tabIconDefault: '#6B6060',
    tabIconSelected: '#C9A84C',
  },
  dark: {
    text: '#FFFFFF',
    background: '#12110F',
    tint: '#C9A84C',
    icon: '#C9A84C',
    tabIconDefault: '#6B6060',
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
