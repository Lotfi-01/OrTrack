import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { type MetalType, METAL_CONFIG } from '@/constants/metals';
import { TAX } from '@/constants/tax';
import { OrTrackColors } from '@/constants/theme';
import { formatEuro, formatQty, formatPctSigned, formatGain, stripMetalFromName } from '@/utils/format';
import { PositionViewModel } from '@/utils/portfolio';

const C = OrTrackColors;

type PositionCardProps = {
  viewModel: PositionViewModel;
  isOpen: boolean;
  isLevel2: boolean;
  masked: boolean;
  currencySymbol: string;
  isPremium: boolean;
  timeStr: string | null;
  onToggle: () => void;
  onExpandL2: () => void;
  onCollapseL2: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onSimulateSale: () => void;
  onShowPaywall: () => void;
  isDeleting?: boolean;
};

export default function PositionCard({
  viewModel,
  isOpen,
  isLevel2,
  masked,
  currencySymbol,
  timeStr,
  onToggle,
  onExpandL2,
  onCollapseL2,
  onEdit,
  onDelete,
  onSimulateSale,
  isDeleting,
}: PositionCardProps) {
  const pos = viewModel.position;
  const { currentValue, totalCost, gainLoss, gainPct, fiscal, sellerNetForfaitaire: posSellerNet } = viewModel.metrics;
  const cfg = METAL_CONFIG[pos.metal as MetalType];

  return (
    <View style={[st.card, isOpen && st.cardOpen]}>
      {/* ── FERMÉ ── */}
      <TouchableOpacity
        style={st.cardRow}
        onPress={onToggle}
        activeOpacity={0.7}
        disabled={masked}
      >
        <View style={[st.badgeCircle, { backgroundColor: cfg.chipBorder, borderColor: cfg.chipBorder }]}>
          <Text style={[st.badgeText, { color: C.background }]}>{cfg.symbol}</Text>
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={st.cardName} numberOfLines={1}>{stripMetalFromName(pos.product)}</Text>
          {masked ? null : gainLoss !== null ? (() => {
            const g = formatGain(gainLoss);
            const color = g.state === 'zero' ? C.textDim : g.state === 'positive' ? C.green : C.red;
            return (
              <Text style={[st.cardGain, { color }]}>
                {'Gain : '}{g.text} {currencySymbol} ({formatPctSigned(gainPct ?? 0)})
              </Text>
            );
          })() : (
            <Text style={st.cardGainPlaceholder}>{'\u2014'}</Text>
          )}
          {!masked && (() => {
            const qtyLabel = `${formatQty(pos.quantity)} pièce${pos.quantity > 1 ? 's' : ''}`;
            if (!fiscal) return <Text style={st.cardMicro}>{qtyLabel}</Text>;
            if (fiscal.isExonere) return <Text style={st.cardMicro}>{qtyLabel} {'\u00B7'} Exonéré</Text>;
            const yLeft = fiscal.exemptionYear - new Date().getFullYear();
            if (yLeft <= 3) return <Text style={[st.cardMicro, { color: C.textDim }]}>{qtyLabel} {'\u00B7'} Bientôt exonéré ({fiscal.exemptionYear})</Text>;
            return <Text style={st.cardMicro}>{qtyLabel} {'\u00B7'} Abattement fiscal : {fiscal.abattement} %</Text>;
          })()}
        </View>
        {!masked && (
          <>
            <Text style={st.cardValue}>
              {currentValue !== null ? `${formatEuro(currentValue)} ${currencySymbol}` : '\u2014'}
            </Text>
            <Text style={[st.chev, { transform: [{ rotate: isOpen ? '180deg' : '0deg' }] }]}>{'\u203A'}</Text>
          </>
        )}
        {masked && (
          <Text style={{ color: C.textDim, fontSize: 13 }}>{'\u2022\u2022\u2022\u2022\u2022\u2022'}</Text>
        )}
      </TouchableOpacity>

      {/* ── L1 — FISCAL ── */}
      {isOpen && !masked && (
        <View style={st.l1}>
          <Text style={st.l1Title}>{'MONTANT RÉCUPÉRABLE ESTIMÉ'}</Text>
          <View style={st.l1Row}>
            <Text style={st.l1Regime}>{'Régime forfaitaire ('}{TAX.labels.forfaitaire}{')'}</Text>
            {posSellerNet !== null ? (
              <Text style={st.l1NetVendeur}>
                {'~'}{formatEuro(posSellerNet)} {currencySymbol}
              </Text>
            ) : (
              <Text style={st.l1NetVendeur}>{'\u2014'}</Text>
            )}
          </View>
          <View style={st.l1Trust}>
            <Text style={st.l1TrustText}>
              Régime : Forfaitaire {TAX.labels.forfaitaire} {'\u00B7'} Cours spot
              {timeStr ? ` \u00B7 Mis à jour à ${timeStr}` : ''}
            </Text>
          </View>

          <TouchableOpacity
            style={st.ctaSimuler}
            onPress={onSimulateSale}
            activeOpacity={0.7}
          >
            <Text style={st.ctaSimulerText}>{'Simuler ma vente →'}</Text>
          </TouchableOpacity>

          {!isLevel2 && (
            <TouchableOpacity style={st.expandBtn} onPress={onExpandL2}>
              <Text style={st.expandBtnText}>{'Voir achat et fiscalité '}{'\u203A'}</Text>
            </TouchableOpacity>
          )}

          {/* ── L2 — DÉTAILS ── */}
          {isLevel2 && (
            <View style={st.l2}>
              {fiscal && (
                <>
                  <Text style={st.l2SectionTitle}>{'EXONÉRATION FISCALE \u00B7 Régime des plus-values'}</Text>
                  <View style={st.l2FiscalRow}>
                    <Text style={st.l2FiscalText}>Détention : {fiscal.detentionLabel}</Text>
                    <Text style={st.l2FiscalText}>Abattement : {fiscal.abattement} %</Text>
                  </View>
                  <View style={st.progressBg}>
                    <View
                      style={[
                        st.progressFill,
                        { width: `${Math.max(0, Math.min(fiscal.abattement, 100))}%` },
                      ]}
                    />
                  </View>
                  {fiscal.isExonere ? (
                    <Text style={{ color: C.white, fontSize: 12, fontWeight: '600' }}>Exonéré {'\u2713'}</Text>
                  ) : (
                    <Text style={{ color: C.white, fontSize: 12, fontWeight: '600' }}>
                      Totalement exonéré en {fiscal.exemptionLabel}
                    </Text>
                  )}
                </>
              )}

              <View style={st.l2Grid}>
                <View style={st.l2GridItem}>
                  <Text style={st.l2GridLabel}>Quantité</Text>
                  <Text style={st.l2GridValue}>
                    {formatQty(pos.quantity)} pièce{pos.quantity > 1 ? 's' : ''}
                  </Text>
                </View>
                <View style={st.l2GridItem}>
                  <Text style={st.l2GridLabel}>Acheté le</Text>
                  <Text style={st.l2GridValue}>{pos.purchaseDate}</Text>
                </View>
                <View style={st.l2GridItem}>
                  <Text style={st.l2GridLabel}>Prix d{'\u2019'}achat</Text>
                  <Text style={st.l2GridValue}>{formatEuro(pos.purchasePrice)} {'€'}</Text>
                </View>
              </View>

              <View style={st.l2Compare}>
                <View style={{ flex: 1 }}>
                  <Text style={st.l2CompareLabel}>Investi</Text>
                  <Text style={st.l2CompareValue}>{formatEuro(totalCost)} {currencySymbol}</Text>
                </View>
                <View style={st.l2CompareDivider} />
                <View style={{ flex: 1, alignItems: 'flex-end' }}>
                  <Text style={st.l2CompareLabel}>Vaut aujourd{'\u2019'}hui</Text>
                  <Text style={st.l2CompareValue}>
                    {currentValue !== null ? `${formatEuro(currentValue)} ${currencySymbol}` : '\u2014'}
                  </Text>
                </View>
              </View>

              {pos.note != null && pos.note.trim().length > 0 && pos.note.trim() !== 'Note' && (
                <Text style={st.l2Note}>{pos.note}</Text>
              )}

              <View style={st.l2Actions}>
                <TouchableOpacity onPress={onEdit}>
                  <Text style={st.l2Edit}>Modifier</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={onDelete} disabled={isDeleting} style={isDeleting ? { opacity: 0.4 } : undefined}>
                  <Ionicons name="ellipsis-vertical" size={16} color={C.textDim} />
                </TouchableOpacity>
              </View>

              <TouchableOpacity style={st.collapseBtn} onPress={onCollapseL2}>
                <Text style={st.collapseBtnText}>Réduire</Text>
                <Text style={st.collapseChev}>{'\u203A'}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  card: { backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.border, overflow: 'hidden', marginBottom: 10 },
  cardOpen: { backgroundColor: C.cardOpen, borderColor: C.openBorder },
  cardRow: { flexDirection: 'row', alignItems: 'center', padding: 14, paddingHorizontal: 16, gap: 0 },
  badgeCircle: { width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, borderColor: C.gold, justifyContent: 'center', alignItems: 'center' },
  badgeText: { color: C.gold, fontSize: 9, fontWeight: '700', textAlign: 'center' },
  cardName: { color: C.white, fontSize: 14, fontWeight: '600' },
  cardGain: { fontSize: 11, fontWeight: '600', marginTop: 1 },
  cardGainPlaceholder: { color: C.textMuted, fontSize: 11, marginTop: 1 },
  cardMicro: { color: C.textMuted, fontSize: 10, marginTop: 2 },
  cardValue: { color: C.white, fontSize: 14, fontWeight: '600', flexShrink: 0, marginRight: 8, textAlign: 'right' },
  chev: { color: C.textDim, opacity: 0.75, fontSize: 18 },
  l1: { borderTopWidth: 1, borderTopColor: C.divider, paddingHorizontal: 16, paddingBottom: 14 },
  l1Title: { color: C.gold, fontSize: 11, fontWeight: '700', letterSpacing: 1, marginTop: 12, marginBottom: 8, textTransform: 'uppercase' },
  l1Row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  l1Regime: { color: C.textDim, fontSize: 12 },
  l1NetVendeur: { color: C.gold, fontSize: 16, fontWeight: '700' },
  l1Trust: { backgroundColor: 'rgba(201,168,76,0.03)', borderRadius: 6, padding: 8, marginBottom: 12 },
  l1TrustText: { color: C.textDim, fontSize: 10 },
  ctaSimuler: { borderWidth: 1.5, borderColor: C.gold, backgroundColor: 'transparent', borderRadius: 10, paddingVertical: 12, marginBottom: 12 },
  ctaSimulerText: { color: C.gold, fontSize: 13, fontWeight: '700', textAlign: 'center' },
  expandBtn: { borderTopWidth: 1, borderTopColor: C.divider, paddingVertical: 10, alignItems: 'center' },
  expandBtnText: { color: C.textDim, fontSize: 11 },
  l2: { borderTopWidth: 1, borderTopColor: C.divider, paddingTop: 12, paddingHorizontal: 16 },
  l2SectionTitle: { color: C.gold, fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 8, textTransform: 'uppercase' },
  l2FiscalRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  l2FiscalText: { color: C.textMuted, fontSize: 11 },
  progressBg: { height: 6, borderRadius: 3, backgroundColor: C.border, opacity: 0.8, overflow: 'hidden', marginBottom: 8 },
  progressFill: { height: '100%', borderRadius: 3, backgroundColor: C.gold },
  l2Grid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 14 },
  l2GridItem: { width: '48%', marginBottom: 8 },
  l2GridLabel: { color: C.textDim, fontSize: 10, marginBottom: 2 },
  l2GridValue: { color: C.white, fontSize: 12, fontWeight: '600' },
  l2Compare: { flexDirection: 'row', alignItems: 'center', marginTop: 8, marginBottom: 12 },
  l2CompareLabel: { color: C.textDim, fontSize: 10, marginBottom: 4 },
  l2CompareValue: { color: C.white, fontSize: 15, fontWeight: '700' },
  l2CompareDivider: { width: 1, backgroundColor: C.border, marginHorizontal: 12, alignSelf: 'stretch' },
  l2Note: { color: C.gold, fontSize: 11, fontStyle: 'italic', marginBottom: 8 },
  l2Actions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: C.divider, paddingTop: 12, marginBottom: 8 },
  l2Edit: { color: C.gold, fontSize: 12, fontWeight: '600' },
  collapseBtn: { borderTopWidth: 1, borderTopColor: C.divider, paddingVertical: 8, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 4 },
  collapseBtnText: { color: C.textDim, fontSize: 11 },
  collapseChev: { color: C.textDim, fontSize: 12, transform: [{ rotate: '-90deg' }] },
});
