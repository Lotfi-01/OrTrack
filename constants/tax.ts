export const TAX = {
  forfaitaireRate: 0.115,
  // 19% impôt sur le revenu + 17,2% prélèvements sociaux
  plusValueRate: 0.362,
  abatementStartYear: 3,
  abatementPerYear: 0.05,
  fullExemptionYear: 22,
  labels: {
    forfaitaire: '11,5 %',
    plusValue: '36,2 %',
  },
} as const;
