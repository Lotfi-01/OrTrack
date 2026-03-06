import { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { OrTrackColors } from '@/constants/theme';

type MetalInfo = {
  key: string;
  name: string;
  symbol: string;
  color: string;
  description: string;
  units: string;
  purity?: string;
  funFact: string;
};

const METALS: MetalInfo[] = [
  {
    key: 'gold',
    name: 'Or',
    symbol: 'XAU',
    color: '#C9A84C',
    description:
      "Valeur refuge par excellence. Réserve de valeur millénaire, l'or résiste à l'inflation et aux crises économiques. Prisé des banques centrales et investisseurs.",
    units: 'Once troy : 31,1g \u00B7 Lingot 1kg = 32,15 oz',
    purity: '999,9\u2030 (lingots) \u00B7 916\u2030 (Napoléon 20F)',
    funFact:
      "Tout l'or jamais extrait tiendrait dans un cube de 21 mètres de côté.",
  },
  {
    key: 'silver',
    name: 'Argent',
    symbol: 'XAG',
    color: '#A8A8B8',
    description:
      "Métal industriel et monétaire. Plus volatil que l'or, il offre un effet de levier en période haussière. 70% de la production est consommée par l'industrie.",
    units: 'Once troy : 31,1g \u00B7 Lingot 1kg',
    purity: "999\u2030 pour pièces et lingots d'investissement",
    funFact:
      "L'argent est le meilleur conducteur électrique de tous les métaux.",
  },
  {
    key: 'platinum',
    name: 'Platine',
    symbol: 'XPT',
    color: '#E0E0E0',
    description:
      "Plus rare que l'or, le platine est très utilisé dans l'industrie automobile pour les pots catalytiques. Son cours est souvent inférieur à l'or.",
    units: 'Once troy : 31,1g',
    purity: "950\u2030 pour pièces d'investissement",
    funFact:
      '90% de la production mondiale de platine vient d\u2019Afrique du Sud.',
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
  },
  {
    key: 'copper',
    name: 'Cuivre',
    symbol: 'XCU',
    color: '#B87333',
    description:
      'Indicateur de santé économique mondiale, le cuivre est le métal industriel de référence. Sa demande reflète directement l\u2019activité économique globale.',
    units: 'Once troy pour cohérence \u00B7 coté en $/lb sur marchés',
    funFact: 'Le cuivre est 100% recyclable sans perte de qualité.',
  },
];

export function MetalGuide() {
  const [openKey, setOpenKey] = useState<string | null>(null);

  const toggle = (key: string) => {
    setOpenKey((prev) => (prev === key ? null : key));
  };

  return (
    <View>
      {METALS.map((m) => {
        const isOpen = openKey === m.key;
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

                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Unités</Text>
                  <Text style={styles.infoValue}>{m.units}</Text>
                </View>

                {m.purity && (
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Pureté</Text>
                    <Text style={styles.infoValue}>{m.purity}</Text>
                  </View>
                )}

                <View style={styles.funFactBox}>
                  <Text style={styles.funFactLabel}>Le saviez-vous ?</Text>
                  <Text style={styles.funFactText}>{m.funFact}</Text>
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
});
