/** Seuils de l'écran Statistiques — pas de magic numbers inline */
export const STATS = {
  /** Mois max pour afficher l'insight fenêtre fiscale */
  FISCAL_WINDOW_MONTHS: 18,
  /** Mois max pour afficher "Position à surveiller" (variante longue) */
  FISCAL_WATCH_MONTHS: 36,
  /** Économie minimum pour afficher l'insight fenêtre fiscale */
  FISCAL_MIN_SAVINGS: 50,
  /** Écart minimum entre régimes pour afficher l'insight régime */
  REGIME_MIN_DELTA: 50,
  /** Seuil top 2 positions pour insight concentration PV */
  CONCENTRATION_TOP2_THRESHOLD: 0.70,
  /** Seuil top 1 position pour insight concentration PV */
  CONCENTRATION_TOP1_THRESHOLD: 0.50,
  /** Seuil métal dominant pour insight dépendance */
  METAL_DOMINANCE_THRESHOLD: 0.75,
  /** Min positions pour afficher insight concentration */
  CONCENTRATION_MIN_POSITIONS: 3,
  /** Min positions pour afficher carte Moteur de performance */
  MOTOR_MIN_POSITIONS: 3,
  /** Seuil contribution pour carte Moteur de performance */
  MOTOR_MIN_CONTRIBUTION: 0.50,
  /** Max positions visibles dans le classement */
  MAX_VISIBLE_POSITIONS: 3,
  /** Seuil positions pour afficher les 3 onglets au lieu du toggle */
  TABS_MIN_POSITIONS: 4,
} as const;
