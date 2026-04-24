import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { OrTrackColors } from '@/constants/theme';
import { formatEuro, formatPctSigned, formatGain } from '@/utils/format';
import { PortfolioSummary } from '@/utils/portfolio';

const C = OrTrackColors;

type PortfolioHeroProps = {
  summary: PortfolioSummary;
  currencySymbol: string;
  masked: boolean;
  pricesReady: boolean;
  spotError: string | null;
  hasFilteredPositions: boolean;
  hasSilverPositions: boolean;
  onPressFiscal: () => void;
  ctaDisabled: boolean;
};

export default function PortfolioHero({
  summary,
  currencySymbol,
  masked,
  pricesReady,
  spotError,
  hasFilteredPositions,
  hasSilverPositions,
  onPressFiscal,
  ctaDisabled,
}: PortfolioHeroProps) {
  const m = (text: string) => (masked ? '\u2022\u2022\u2022\u2022\u2022\u2022' : text);

  return (
    <View style={st.heroCard}>
      {pricesReady ? (
        <>
          <Text style={st.resumeValue}>{m(`${formatEuro(summary.totalValue)} ${currencySymbol}`)}</Text>
          {hasFilteredPositions && !masked && (() => {
            const g = formatGain(summary.gain);
            const color = g.state === 'zero' ? C.textDim : g.state === 'positive' ? C.green : C.red;
            return (
            <>
              <View style={st.resumeGainRow}>
                <Text style={[st.resumeGain, { color }]}>
                  {'Gain brut : '}{g.text} {currencySymbol}
                </Text>
                <Text style={st.resumeGainPct}>({formatPctSigned(summary.gainPct)})</Text>
              </View>
              <View style={st.resumeNetRow}>
                <Text style={st.resumeNetVendeur}>
                  {'Net forfaitaire estimé : ~'}{formatEuro(summary.sellerNet)} {currencySymbol}
                </Text>
                <Text style={st.resumeNetSub}>{'Estimation au régime forfaitaire'}</Text>
              </View>
            </>
            );
          })()}
          {masked && hasFilteredPositions && (
            <Text style={{ color: C.textDim, fontSize: 13, marginTop: 4 }}>{'\u2022\u2022\u2022\u2022\u2022\u2022'}</Text>
          )}
        </>
      ) : spotError ? (
        <Text style={{ color: C.textMuted, fontSize: 12, textAlign: 'center' }}>Cours indisponibles</Text>
      ) : (
        <View>
          <View style={{ width: 180, height: 26, borderRadius: 6, backgroundColor: C.border, marginBottom: 10 }} />
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
            <View style={{ width: 80, height: 20, borderRadius: 5, backgroundColor: C.border }} />
            <View style={{ width: 70, height: 20, borderRadius: 5, backgroundColor: C.border }} />
          </View>
          <View style={{ width: '100%', height: 36, borderRadius: 9, backgroundColor: C.border }} />
        </View>
      )}

      {/* CTA fiscal */}
      <TouchableOpacity
        style={[st.ctaFiscal, ctaDisabled && { opacity: 0.5 }]}
        onPress={onPressFiscal}
        activeOpacity={0.7}
        disabled={ctaDisabled}
      >
        <Text style={st.ctaFiscalText}>{'Voir combien je récupère →'}</Text>
      </TouchableOpacity>
      <Text style={st.ctaSub}>Voyez votre net de vente estimé</Text>
    </View>
  );
}

const st = StyleSheet.create({
  heroCard: { backgroundColor: C.card, borderRadius: 18, borderWidth: 1, borderColor: C.border, padding: 16, marginBottom: 14 },
  resumeValue: { fontSize: 30, fontWeight: '700', color: C.white, letterSpacing: -0.5 },
  resumeGainRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  resumeGain: { fontSize: 12, fontWeight: '600' },
  resumeGainPct: { color: C.textMuted, fontSize: 12 },
  resumeNetRow: { marginTop: 10 },
  resumeNetVendeur: { color: C.gold, fontSize: 17, fontWeight: '700' },
  resumeNetSub: { color: C.textDim, fontSize: 11, fontStyle: 'italic', marginTop: 2 },
  ctaFiscal: { borderWidth: 1.5, borderColor: C.gold, backgroundColor: 'transparent', borderRadius: 12, paddingVertical: 11, marginTop: 14 },
  ctaFiscalText: { color: C.gold, fontSize: 13.5, fontWeight: '700', textAlign: 'center' },
  ctaSub: { textAlign: 'center', marginTop: 5, fontSize: 11, color: C.textMuted },
});
