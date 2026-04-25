export type AnalyticsEventName =
  | 'app_opened'
  | 'home_viewed'
  | 'portfolio_viewed'
  | 'add_position_started'
  | 'add_position_completed'
  | 'global_simulation_opened'
  | 'premium_teaser_viewed'
  | 'premium_teaser_clicked'
  | 'paywall_viewed'
  | 'paywall_plan_selected'
  | 'purchase_started'
  | 'purchase_success'
  | 'purchase_cancelled'
  | 'purchase_failed'
  | 'restore_started'
  | 'restore_success'
  | 'restore_failed';

export const ANALYTICS_EVENT_NAMES: readonly AnalyticsEventName[] = [
  'app_opened',
  'home_viewed',
  'portfolio_viewed',
  'add_position_started',
  'add_position_completed',
  'global_simulation_opened',
  'premium_teaser_viewed',
  'premium_teaser_clicked',
  'paywall_viewed',
  'paywall_plan_selected',
  'purchase_started',
  'purchase_success',
  'purchase_cancelled',
  'purchase_failed',
  'restore_started',
  'restore_success',
  'restore_failed',
] as const;

export type AnalyticsProperties = Record<string, string | number | boolean | null>;
