export const TAX = {
  forfaitaireRate: 0.115,
  /** @pending Validation doctrine LFSS 2026 — taux susceptible de passer à 0.362 */
  plusValueRate: 0.376,
  abatementStartYear: 3,
  abatementPerYear: 0.05,
  fullExemptionYear: 22,
  labels: {
    forfaitaire: '11,5 %',
    plusValue: '37,6 %',
  },
} as const;
