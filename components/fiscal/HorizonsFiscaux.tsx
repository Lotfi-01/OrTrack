import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { OrTrackColors } from '@/constants/theme';
import type { FiscalHorizonCard, FiscalHorizonRegime } from '@/utils/fiscal-horizons';

const C = OrTrackColors;

// ─── Types ───────────────────────────────────────────────────────────────────

export type HorizonsFiscauxProps = {
  horizons: FiscalHorizonCard[];
  isPremium: boolean;
  masked: boolean;
  formatMoney: (value: number) => string;
  formatDate: (value: Date) => string;
  mask: (value: string) => string;
  onPressPaywall?: () => void;
};

// ─── Helpers de rendu ────────────────────────────────────────────────────────

function regimeLabel(regime: FiscalHorizonRegime | null): string {
  if (regime === 'forfaitaire') return 'forfaitaire';
  if (regime === 'plusvalues') return 'plus-values';
  if (regime === 'equal') return 'régimes équivalents';
  return '—';
}

function formatDeltaText(
  delta: number | null,
  formatMoney: (value: number) => string,
): string {
  if (delta === null) return '—';
  if (Math.abs(delta) < 0.005) return formatMoney(0);
  if (delta > 0) return `+${formatMoney(delta)}`;
  return formatMoney(delta);
}

// ─── Composant ───────────────────────────────────────────────────────────────

export default function HorizonsFiscaux(props: HorizonsFiscauxProps) {
  const { horizons, isPremium, masked, formatMoney, formatDate, mask, onPressPaywall } = props;

  if (!isPremium) {
    return (
      <View style={st.teaser}>
        <Text style={st.teaserTitle}>Horizons fiscaux</Text>
        <Text style={st.teaserText}>
          Comparez le net vendeur estimé à plusieurs dates fiscales clés.
        </Text>
        <Text style={st.teaserSubtext}>Cours figés au prix du jour.</Text>
        <TouchableOpacity
          style={st.teaserCta}
          onPress={onPressPaywall}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Débloquer les horizons fiscaux"
        >
          <Text style={st.teaserCtaText}>Débloquer les horizons fiscaux</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (horizons.length === 0) return null;

  return (
    <View style={st.section}>
      <Text style={st.title}>Horizons fiscaux</Text>
      <Text style={st.subtitle}>
        Net vendeur estimé à différentes dates de revente.
      </Text>

      <View style={st.cards}>
        {horizons.map((card) => (
          <HorizonCardView
            key={card.kind}
            card={card}
            masked={masked}
            formatMoney={formatMoney}
            formatDate={formatDate}
            mask={mask}
          />
        ))}
      </View>

      <Text style={st.footer}>
        Règles fiscales françaises. Estimation indicative, hors évolution du cours.
      </Text>
    </View>
  );
}

// ─── Carte unitaire ──────────────────────────────────────────────────────────

function HorizonCardView({
  card,
  masked,
  formatMoney,
  formatDate,
  mask,
}: {
  card: FiscalHorizonCard;
  masked: boolean;
  formatMoney: (value: number) => string;
  formatDate: (value: Date) => string;
  mask: (value: string) => string;
}) {
  if (!card.isCalculable) {
    return (
      <View style={st.card}>
        <Text style={st.cardLabel}>{card.label}</Text>
        {card.message && <Text style={st.cardMessage}>{card.message}</Text>}
        {card.microcopy && <Text style={st.cardMicrocopy}>{card.microcopy}</Text>}
      </View>
    );
  }

  const netSellerStr = card.netSeller !== null ? formatMoney(card.netSeller) : '—';
  const deltaStr = formatDeltaText(card.deltaVsToday, formatMoney);

  return (
    <View style={st.card}>
      <Text style={st.cardLabel}>{card.label}</Text>
      {card.simulatedDate && (
        <Text style={st.cardDate}>{formatDate(card.simulatedDate)}</Text>
      )}

      <Text style={st.cardNetLabel}>Net vendeur estimé</Text>
      <Text style={st.cardNetValue}>{masked ? mask(netSellerStr) : netSellerStr}</Text>

      <View style={st.cardRow}>
        <Text style={st.cardRowLabel}>Écart vs aujourd’hui</Text>
        <Text style={st.cardRowValue}>{masked ? mask(deltaStr) : deltaStr}</Text>
      </View>

      <View style={st.cardRow}>
        <Text style={st.cardRowLabel}>Régime fiscal</Text>
        <Text style={st.cardRowValue}>{regimeLabel(card.regime)}</Text>
      </View>

      {card.microcopy && <Text style={st.cardMicrocopy}>{card.microcopy}</Text>}
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  // Bloc Premium
  section: { marginBottom: 20 },
  title: { fontSize: 13, fontWeight: '700', color: C.white, marginBottom: 4 },
  subtitle: { fontSize: 12, color: C.textDim, marginBottom: 12, lineHeight: 18 },
  cards: { gap: 10 },
  footer: {
    fontSize: 11,
    color: C.subtext,
    textAlign: 'center',
    marginTop: 12,
    fontStyle: 'italic',
    lineHeight: 16,
  },

  // Carte
  card: {
    backgroundColor: C.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  cardLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: C.gold,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  cardDate: { fontSize: 12, color: C.textDim, marginBottom: 10 },
  cardNetLabel: { fontSize: 11, color: C.subtext, marginTop: 2 },
  cardNetValue: { fontSize: 18, fontWeight: '700', color: C.white, marginTop: 2, marginBottom: 8 },
  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  cardRowLabel: { fontSize: 12, color: C.subtext, flexShrink: 1, marginRight: 8 },
  cardRowValue: { fontSize: 13, fontWeight: '600', color: C.white, textAlign: 'right' },
  cardMessage: { fontSize: 12, color: C.textDim, lineHeight: 18, marginTop: 4 },
  cardMicrocopy: {
    fontSize: 11,
    color: C.textDim,
    fontStyle: 'italic',
    lineHeight: 16,
    marginTop: 8,
  },

  // Teaser Free
  teaser: {
    backgroundColor: C.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(201,168,76,0.3)',
    padding: 20,
    marginBottom: 20,
    alignItems: 'center',
    gap: 8,
  },
  teaserTitle: { fontSize: 15, fontWeight: '700', color: C.white, textAlign: 'center' },
  teaserText: { fontSize: 12, color: C.subtext, textAlign: 'center', lineHeight: 18 },
  teaserSubtext: {
    fontSize: 11,
    color: C.textDim,
    textAlign: 'center',
    fontStyle: 'italic',
    marginBottom: 4,
  },
  teaserCta: {
    backgroundColor: C.gold,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 24,
    marginTop: 4,
  },
  teaserCtaText: { color: C.background, fontSize: 13, fontWeight: '700' },
});
