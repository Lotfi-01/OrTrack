import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { OrTrackColors } from '@/constants/theme';
import { useSpotPrices } from '@/hooks/use-spot-prices';

const OZ_TO_G = 31.10435;

const PRICE_KEY: Record<string, 'gold' | 'silver' | 'platinum' | 'palladium' | 'copper'> = {
  or: 'gold',
  argent: 'silver',
  platine: 'platinum',
  palladium: 'palladium',
  cuivre: 'copper',
};

type SpotPrices = ReturnType<typeof useSpotPrices>['prices'];

function getDisplayPrice(key: string, prices: SpotPrices): string | null {
  const priceKey = PRICE_KEY[key];
  if (!priceKey) return null;
  const spot = prices[priceKey];
  if (spot === null) return null;
  if (key === 'cuivre') {
    const kgPrice = spot * (1000 / OZ_TO_G);
    return kgPrice.toLocaleString('fr-FR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + ' \u20AC/kg';
  }
  return spot.toLocaleString('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + ' \u20AC/oz';
}

type MetalInfo = {
  key: string;
  name: string;
  symbol: string;
  color: string;
  description: string;
  units: string;
  purity?: string;
  funFact: string;
  usages: string[];
  production: { country: string; pct: string }[];
  priceFactor: string[];
  tip: string;
};

const METALS: MetalInfo[] = [
  {
    key: 'or',
    name: 'Or',
    symbol: 'XAU',
    color: '#C9A84C',
    description:
      "Valeur refuge par excellence. Réserve de valeur millénaire, l'or résiste à l'inflation et aux crises économiques. Prisé des banques centrales et investisseurs.",
    units: 'Once troy : 31,1g \u00B7 Lingot 1kg = 32,15 oz',
    purity: '999,9\u2030 (lingots) \u00B7 916\u2030 (Napoléon 20F)',
    funFact:
      "Tout l'or jamais extrait tiendrait dans un cube de 21 mètres de côté.",
    usages: ['\uD83C\uDFE6 Réserve de valeur', '\uD83D\uDC8D Bijouterie', '\uD83D\uDD2C Électronique'],
    production: [
      { country: 'Chine', pct: '11%' },
      { country: 'Australie', pct: '10%' },
      { country: 'Russie', pct: '9%' },
    ],
    priceFactor: ['Dollar US', 'Taux d\'intérêt', 'Géopolitique'],
    tip: 'Idéal pour débuter, liquide et universel. Minimum recommandé : 5-10% du patrimoine.',
  },
  {
    key: 'argent',
    name: 'Argent',
    symbol: 'XAG',
    color: '#A8A8B8',
    description:
      "Métal industriel et monétaire. Plus volatil que l'or, il offre un effet de levier en période haussière. 70% de la production est consommée par l'industrie.",
    units: 'Once troy : 31,1g \u00B7 Lingot 1kg',
    purity: "999\u2030 pour pièces et lingots d'investissement",
    funFact:
      "L'argent est le meilleur conducteur électrique de tous les métaux.",
    usages: ['\uD83D\uDCF1 Électronique', '\u26A1 Énergie solaire', '\uD83D\uDC8A Médical'],
    production: [
      { country: 'Mexique', pct: '23%' },
      { country: 'Chine', pct: '14%' },
      { country: 'Pérou', pct: '13%' },
    ],
    priceFactor: ['Demande industrielle', 'Ratio Or/Argent', 'Dollar US'],
    tip: 'Plus volatil que l\'or, effet de levier en période haussière. Ratio Or/Argent > 80 = opportunité historique.',
  },
  {
    key: 'platine',
    name: 'Platine',
    symbol: 'XPT',
    color: '#E0E0E0',
    description:
      "Plus rare que l'or, le platine est très utilisé dans l'industrie automobile pour les pots catalytiques. Son cours est souvent inférieur à l'or.",
    units: 'Once troy : 31,1g',
    purity: "950\u2030 pour pièces d'investissement",
    funFact:
      '90% de la production mondiale de platine vient d\u2019Afrique du Sud.',
    usages: ['\uD83D\uDE97 Catalyseurs auto', '\uD83D\uDC8D Joaillerie', '\uD83C\uDFE5 Médical'],
    production: [
      { country: 'Afrique du Sud', pct: '72%' },
      { country: 'Russie', pct: '11%' },
      { country: 'Zimbabwe', pct: '8%' },
    ],
    priceFactor: ['Industrie automobile', 'Mines sud-africaines', 'Hydrogène'],
    tip: 'Concentration de la production en Afrique du Sud = risque géopolitique à surveiller.',
  },
  {
    key: 'palladium',
    name: 'Palladium',
    symbol: 'XPD',
    color: '#CBA135',
    description:
      "Métal du groupe du platine, le palladium est indispensable à l'industrie électronique et aux catalyseurs automobiles. Marché très peu liquide.",
    units: 'Once troy : 31,1g',
    purity: '999,5\u2030 pour lingots',
    funFact:
      "La Russie et l'Afrique du Sud produisent 80% du palladium mondial.",
    usages: ['\uD83D\uDE97 Pots catalytiques', '\uD83D\uDD0B Électronique', '\uD83E\uDDB7 Dentisterie'],
    production: [
      { country: 'Russie', pct: '40%' },
      { country: 'Afrique du Sud', pct: '38%' },
      { country: 'Canada', pct: '6%' },
    ],
    priceFactor: ['Normes antipollution', 'Production russe', 'Véhicules hybrides'],
    tip: 'Très concentré géographiquement. Sensible aux sanctions russes et normes Euro 7.',
  },
  {
    key: 'cuivre',
    name: 'Cuivre',
    symbol: 'XCU',
    color: '#B87333',
    description:
      'Indicateur de santé économique mondiale, le cuivre est le métal industriel de référence. Sa demande reflète directement l\u2019activité économique globale.',
    units: 'Once troy pour cohérence \u00B7 coté en $/lb sur marchés',
    funFact: 'Le cuivre est 100% recyclable sans perte de qualité.',
    usages: ['\u26A1 Électricité', '\uD83C\uDFD7\uFE0F Construction', '\uD83D\uDE97 Véhicules électriques'],
    production: [
      { country: 'Chili', pct: '27%' },
      { country: 'Pérou', pct: '10%' },
      { country: 'Congo', pct: '8%' },
    ],
    priceFactor: ['Croissance chinoise', 'Transition énergétique', 'Dollar US'],
    tip: 'Baromètre de l\'économie mondiale. Forte demande liée aux véhicules électriques et énergies renouvelables.',
  },
];

export function MetalGuide() {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const { prices } = useSpotPrices();

  const toggle = (key: string) => {
    setOpenKey((prev) => (prev === key ? null : key));
  };

  return (
    <View>
      {METALS.map((m) => {
        const isOpen = openKey === m.key;
        const displayPrice = getDisplayPrice(m.key, prices);
        return (
          <View key={m.key} style={styles.card}>
            <TouchableOpacity
              style={styles.header}
              onPress={() => toggle(m.key)}
              activeOpacity={0.7}>
              <View style={styles.headerLeft}>
                <View style={[styles.badge, { borderColor: m.color }]}>
                  <Text style={[styles.badgeText, { color: m.color }]}>
                    {m.symbol}
                  </Text>
                </View>
                <Text style={styles.metalName}>{m.name}</Text>
              </View>
              <Text style={styles.arrow}>{isOpen ? '\u25B2' : '\u25BC'}</Text>
            </TouchableOpacity>

            {isOpen && (
              <View style={styles.body}>
                <Text style={styles.description}>{m.description}</Text>

                {/* Cours actuel */}
                <View style={styles.priceRow}>
                  <Text style={styles.sectionLabel}>COURS ACTUEL</Text>
                  {displayPrice !== null ? (
                    <Text style={styles.priceValue}>{displayPrice}</Text>
                  ) : (
                    <ActivityIndicator size="small" color="#C9A84C" />
                  )}
                </View>

                {/* Unités */}
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Unités</Text>
                  <Text style={styles.infoValue}>{m.units}</Text>
                </View>

                {/* Pureté */}
                {m.purity && (
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Pureté</Text>
                    <Text style={styles.infoValue}>{m.purity}</Text>
                  </View>
                )}

                {/* Usages */}
                <Text style={styles.sectionLabel}>USAGES</Text>
                <View style={styles.tagsRow}>
                  {m.usages.map((u, i) => (
                    <View key={i} style={styles.tag}>
                      <Text style={styles.tagText}>{u}</Text>
                    </View>
                  ))}
                </View>

                {/* Production mondiale */}
                <Text style={styles.sectionLabel}>PRODUCTION MONDIALE</Text>
                {m.production.map((p, i) => (
                  <View key={i} style={styles.productionRow}>
                    <Text style={styles.productionCountry}>{p.country}</Text>
                    <Text style={styles.productionPct}>{p.pct}</Text>
                  </View>
                ))}

                {/* Facteurs de prix */}
                <Text style={styles.sectionLabel}>FACTEURS DE PRIX</Text>
                <View style={styles.tagsRow}>
                  {m.priceFactor.map((f, i) => (
                    <View key={i} style={[styles.tag, styles.tagNeutral]}>
                      <Text style={styles.tagText}>{f}</Text>
                    </View>
                  ))}
                </View>

                {/* Le saviez-vous */}
                <View style={styles.funFactBox}>
                  <Text style={styles.funFactLabel}>Le saviez-vous ?</Text>
                  <Text style={styles.funFactText}>{m.funFact}</Text>
                </View>

                {/* Conseil */}
                <View style={styles.tipBox}>
                  <Text style={styles.tipLabel}>{'\uD83D\uDCA1'} Conseil</Text>
                  <Text style={styles.tipText}>{m.tip}</Text>
                </View>
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: OrTrackColors.card,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: OrTrackColors.border,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  metalName: {
    fontSize: 16,
    fontWeight: '600',
    color: OrTrackColors.white,
  },
  arrow: {
    fontSize: 12,
    color: OrTrackColors.subtext,
  },
  body: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: OrTrackColors.border,
    paddingTop: 14,
  },
  description: {
    fontSize: 13,
    color: OrTrackColors.subtext,
    lineHeight: 20,
    marginBottom: 14,
  },
  infoRow: {
    marginBottom: 8,
  },
  infoLabel: {
    fontSize: 11,
    color: OrTrackColors.gold,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 13,
    color: OrTrackColors.white,
    lineHeight: 19,
  },
  funFactBox: {
    marginTop: 10,
    backgroundColor: 'rgba(201, 168, 76, 0.08)',
    borderRadius: 8,
    padding: 12,
  },
  funFactLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: OrTrackColors.gold,
    marginBottom: 4,
  },
  funFactText: {
    fontSize: 13,
    color: OrTrackColors.subtext,
    lineHeight: 19,
  },
  sectionLabel: {
    fontSize: 11,
    color: '#C9A84C',
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginTop: 12,
    marginBottom: 6,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  priceValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#C9A84C',
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  tag: {
    backgroundColor: 'rgba(201,168,76,0.1)',
    borderColor: 'rgba(201,168,76,0.3)',
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  tagNeutral: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderColor: 'rgba(255,255,255,0.1)',
  },
  tagText: {
    fontSize: 12,
    color: '#FFFFFF',
  },
  productionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  productionCountry: {
    fontSize: 13,
    color: '#FFFFFF',
  },
  productionPct: {
    fontSize: 13,
    color: '#888888',
  },
  tipBox: {
    marginTop: 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  tipLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  tipText: {
    fontSize: 13,
    color: '#888888',
    lineHeight: 19,
  },
});
