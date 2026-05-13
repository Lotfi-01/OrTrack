export type AnalyticsEventName =
  | 'app_opened'
  | 'session_start'
  | 'onboarding_completed'
  | 'home_viewed'
  | 'portfolio_viewed'
  | 'add_position_started'
  | 'add_position_completed'
  | 'global_simulation_opened'
  | 'individual_simulation_opened'
  | 'tap_global_simulation'
  | 'use_simulated_fiscal_date'
  | 'view_alerts'
  | 'premium_teaser_viewed'
  | 'premium_teaser_clicked'
  | 'paywall_viewed'
  | 'paywall_plan_selected'
  | 'paywall_dismissed'
  | 'purchase_started'
  | 'purchase_success'
  | 'purchase_cancelled'
  | 'purchase_failed'
  | 'restore_started'
  | 'restore_success'
  | 'restore_failed'
  | 'point_mort_viewed';

export const ANALYTICS_EVENT_NAMES: readonly AnalyticsEventName[] = [
  'app_opened',
  'session_start',
  'onboarding_completed',
  'home_viewed',
  'portfolio_viewed',
  'add_position_started',
  'add_position_completed',
  'global_simulation_opened',
  'individual_simulation_opened',
  'tap_global_simulation',
  'use_simulated_fiscal_date',
  'view_alerts',
  'premium_teaser_viewed',
  'premium_teaser_clicked',
  'paywall_viewed',
  'paywall_plan_selected',
  'paywall_dismissed',
  'purchase_started',
  'purchase_success',
  'purchase_cancelled',
  'purchase_failed',
  'restore_started',
  'restore_success',
  'restore_failed',
  'point_mort_viewed',
] as const;

export type AnalyticsProperties = Record<string, string | number | boolean | null>;
