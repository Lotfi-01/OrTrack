import { Stack, router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { OrTrackColors } from '@/constants/theme';
import { usePremium } from '@/contexts/premium-context';
import { type AlertCondition, type AlertMetal, type PriceAlert, usePriceAlerts } from '@/hooks/use-price-alerts';
import { useSpotPrices } from '@/hooks/use-spot-prices';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtPrice(n: number): string {
  return n.toLocaleString('fr-FR', { maximumFractionDigits: 0 });
}

function relativTime(isoStr: string): string {
  const diffMs = Date.now() - new Date(isoStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `il y a ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  return `il y a ${days} j`;
}

// ─── Suggestions ──────────────────────────────────────────────────────────────

type Suggestion = {
  label: string;
  metal: AlertMetal;
  condition: AlertCondition;
  threshold: number;
};

const SUGGESTIONS: Suggestion[] = [
  { label: "M'alerter si l'or dépasse 4\u202F500 €/oz", metal: 'or', condition: 'above', threshold: 4500 },
  { label: "M'alerter si l'argent passe sous 70 €/oz", metal: 'argent', condition: 'below', threshold: 70 },
];

// ─── Composant carte alerte ───────────────────────────────────────────────────

function AlertCard({
  alert,
  onToggle,
  onDelete,
}: {
  alert: PriceAlert;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const isGold = alert.metal === 'or';
  const conditionLabel = alert.condition === 'above' ? 'Au-dessus de' : 'En-dessous de';

  return (
    <View style={[styles.alertCard, !alert.active && styles.alertCardInactive]}>
      {/* Ligne principale */}
      <View style={styles.alertRow}>
        {/* Badge métal */}
        <View style={[styles.metalBadge, isGold ? styles.badgeGold : styles.badgeSilver]}>
          <Text style={[styles.metalBadgeText, isGold ? styles.badgeTextGold : styles.badgeTextSilver]}>
            {isGold ? 'XAU' : 'XAG'}
          </Text>
        </View>

        {/* Info */}
        <View style={styles.alertInfo}>
          <Text style={[styles.alertConditionText, !alert.active && styles.textMuted]}>
            {conditionLabel}
          </Text>
          <Text style={[styles.alertThreshold, !alert.active && styles.textMuted]}>
            {fmtPrice(alert.threshold)} €/oz
          </Text>
        </View>

        {/* Toggle + supprimer */}
        <View style={styles.alertActions}>
          <Switch
            value={alert.active}
            onValueChange={onToggle}
            trackColor={{ false: OrTrackColors.border, true: OrTrackColors.gold }}
            thumbColor={OrTrackColors.white}
            style={styles.switchCompact}
          />
          <TouchableOpacity
            onPress={onDelete}
            style={styles.deleteBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.deleteBtnText}>×</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Dernière notification */}
      {alert.lastTriggeredAt && (
        <Text style={styles.lastTriggered}>
          Dernière alerte : {relativTime(alert.lastTriggeredAt)}
        </Text>
      )}
    </View>
  );
}

// ─── Écran principal ──────────────────────────────────────────────────────────

export default function AlertesScreen() {
  const { alerts, hasPermission, loading, addAlert, deleteAlert, toggleAlert } = usePriceAlerts();
  const { prices } = useSpotPrices();
  const { canAddAlert, showPaywall } = usePremium();

  // ── État du formulaire ────────────────────────────────────────────────────
  const [showForm, setShowForm] = useState(false);
  const [formMetal, setFormMetal] = useState<AlertMetal>('or');
  const [formCondition, setFormCondition] = useState<AlertCondition>('above');
  const [formThreshold, setFormThreshold] = useState('');

  // Pré-remplir le seuil avec le cours actuel quand le métal change
  useEffect(() => {
    const price = formMetal === 'or' ? prices.gold : prices.silver;
    if (price !== null) {
      setFormThreshold(Math.round(price).toString());
    }
  }, [formMetal, prices]);

  const handleOpenForm = () => {
    if (!canAddAlert(alerts.length)) {
      showPaywall();
      return;
    }
    // Pré-remplir immédiatement à l'ouverture
    const price = formMetal === 'or' ? prices.gold : prices.silver;
    if (price !== null) setFormThreshold(Math.round(price).toString());
    setShowForm(true);
  };

  const handleSubmit = async () => {
    const threshold = parseFloat(formThreshold.replace(',', '.').replace(/\s/g, ''));
    if (isNaN(threshold) || threshold <= 0) return;
    if (!canAddAlert(alerts.length)) {
      setShowForm(false);
      showPaywall();
      return;
    }
    await addAlert({ metal: formMetal, condition: formCondition, threshold, active: true });
    setShowForm(false);
  };

  const handleDelete = (id: string) => {
    Alert.alert(
      'Supprimer l\'alerte',
      'Cette alerte sera définitivement supprimée.',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Supprimer', style: 'destructive', onPress: () => deleteAlert(id) },
      ]
    );
  };

  const applySuggestion = (s: Suggestion) => {
    if (!canAddAlert(alerts.length)) {
      showPaywall();
      return;
    }
    setFormMetal(s.metal);
    setFormCondition(s.condition);
    setFormThreshold(s.threshold.toString());
    setShowForm(true);
  };

  // ─── Rendu ─────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{ title: 'Alertes de cours', headerBackTitle: 'Retour' }} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Bannière permission ── */}
        {!loading && !hasPermission && (
          <View style={styles.permBanner}>
            <Text style={styles.permIcon}>🔕</Text>
            <View style={styles.permText}>
              <Text style={styles.permTitle}>Notifications désactivées</Text>
              <Text style={styles.permSub}>
                Activez les notifications dans les réglages de votre appareil pour recevoir les alertes.
              </Text>
            </View>
          </View>
        )}

        {/* ── Bouton Ajouter ── */}
        {!showForm && (
          <TouchableOpacity style={styles.addButton} onPress={handleOpenForm} activeOpacity={0.8}>
            <Text style={styles.addButtonText}>+ Ajouter une alerte</Text>
          </TouchableOpacity>
        )}

        {/* ── Formulaire ── */}
        {showForm && (
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>Nouvelle alerte</Text>

            {/* Métal */}
            <Text style={styles.formLabel}>Métal</Text>
            <View style={styles.segmentRow}>
              {(['or', 'argent'] as AlertMetal[]).map((m) => (
                <TouchableOpacity
                  key={m}
                  style={[styles.segmentBtn, formMetal === m && styles.segmentBtnActive]}
                  onPress={() => setFormMetal(m)}>
                  <Text style={[styles.segmentText, formMetal === m && styles.segmentTextActive]}>
                    {m === 'or' ? 'Or (XAU)' : 'Argent (XAG)'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Condition */}
            <Text style={styles.formLabel}>Condition</Text>
            <View style={styles.segmentRow}>
              {[
                { value: 'above' as AlertCondition, label: 'Au-dessus de' },
                { value: 'below' as AlertCondition, label: 'En-dessous de' },
              ].map(({ value, label }) => (
                <TouchableOpacity
                  key={value}
                  style={[styles.segmentBtn, formCondition === value && styles.segmentBtnActive]}
                  onPress={() => setFormCondition(value)}>
                  <Text style={[styles.segmentText, formCondition === value && styles.segmentTextActive]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Seuil */}
            <Text style={styles.formLabel}>Seuil (€/oz)</Text>
            <TextInput
              style={styles.input}
              value={formThreshold}
              onChangeText={setFormThreshold}
              keyboardType="decimal-pad"
              placeholder="Ex : 4500"
              placeholderTextColor={OrTrackColors.subtext}
              selectionColor={OrTrackColors.gold}
            />

            {/* Aperçu */}
            <View style={styles.formPreview}>
              <Text style={styles.formPreviewText}>
                → Notification si l'{formMetal} {formCondition === 'above' ? 'dépasse' : 'passe sous'}{' '}
                {formThreshold || '…'} €/oz
              </Text>
            </View>

            {/* Boutons */}
            <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit}>
              <Text style={styles.submitBtnText}>Créer l'alerte</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowForm(false)}>
              <Text style={styles.cancelBtnText}>Annuler</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Liste des alertes ── */}
        {alerts.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>
              Alertes configurées ({alerts.length})
            </Text>
            {alerts.map((alert) => (
              <AlertCard
                key={alert.id}
                alert={alert}
                onToggle={() => toggleAlert(alert.id)}
                onDelete={() => handleDelete(alert.id)}
              />
            ))}
          </View>
        ) : (
          !loading && !showForm && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>🔔</Text>
              <Text style={styles.emptyTitle}>Aucune alerte configurée</Text>
              <Text style={styles.emptyText}>
                Créez une alerte pour être notifié dès qu'un seuil de cours est atteint.
              </Text>
            </View>
          )
        )}

        {/* ── Suggestions ── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Suggestions</Text>
          {SUGGESTIONS.map((s, i) => (
            <TouchableOpacity key={i} style={styles.suggestionCard} onPress={() => applySuggestion(s)}>
              <Text style={styles.suggestionText}>{s.label}</Text>
              <Text style={styles.suggestionAdd}>+ Ajouter</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Disclaimer ── */}
        <View style={styles.disclaimer}>
          <Text style={styles.disclaimerText}>
            Les alertes fonctionnent uniquement lorsque l'application est ouverte. Les cours sont vérifiés toutes les 15 minutes. Un délai de carence d'1 heure s'applique entre deux notifications pour la même alerte.
          </Text>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const { background, gold, white, card, border, subtext, tabIconDefault } = OrTrackColors;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: background },
  scroll: { padding: 20, paddingBottom: 48 },

  // Permission banner
  permBanner: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: '#1C1A0A',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#4A3A00',
    padding: 14,
    marginBottom: 16,
    alignItems: 'flex-start',
  },
  permIcon: { fontSize: 20 },
  permText: { flex: 1 },
  permTitle: { fontSize: 14, fontWeight: '700', color: '#E5C547', marginBottom: 4 },
  permSub: { fontSize: 12, color: subtext, lineHeight: 18 },

  // Bouton ajouter
  addButton: {
    backgroundColor: gold,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 24,
    shadowColor: gold,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 5,
  },
  addButtonText: { fontSize: 15, fontWeight: '700', color: background },

  // Formulaire
  formCard: {
    backgroundColor: card,
    borderRadius: 14,
    padding: 18,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: gold,
  },
  formTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: gold,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 16,
  },
  formLabel: {
    fontSize: 11,
    color: subtext,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  segmentRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  segmentBtn: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: background,
    borderWidth: 1,
    borderColor: border,
  },
  segmentBtnActive: {
    backgroundColor: '#1F1B0A',
    borderColor: gold,
  },
  segmentText: {
    fontSize: 13,
    color: subtext,
    fontWeight: '500',
  },
  segmentTextActive: {
    color: gold,
    fontWeight: '700',
  },
  input: {
    backgroundColor: background,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: white,
    marginBottom: 12,
  },
  formPreview: {
    backgroundColor: '#12121E',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 16,
  },
  formPreviewText: {
    fontSize: 13,
    color: subtext,
    fontStyle: 'italic',
    lineHeight: 20,
  },
  submitBtn: {
    backgroundColor: gold,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    marginBottom: 10,
  },
  submitBtnText: { fontSize: 15, fontWeight: '700', color: background },
  cancelBtn: {
    backgroundColor: background,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: border,
  },
  cancelBtnText: { fontSize: 14, color: subtext, fontWeight: '500' },

  // Section
  section: { marginBottom: 28 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: gold,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 12,
  },

  // Carte alerte
  alertCard: {
    backgroundColor: card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: border,
  },
  alertCardInactive: { opacity: 0.55 },
  alertRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  metalBadge: {
    borderRadius: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderWidth: 1,
  },
  badgeGold: { backgroundColor: '#1F1B0A', borderColor: gold },
  badgeSilver: { backgroundColor: '#18181F', borderColor: '#A8A8B8' },
  metalBadgeText: { fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  badgeTextGold: { color: gold },
  badgeTextSilver: { color: '#A8A8B8' },
  alertInfo: { flex: 1 },
  alertConditionText: { fontSize: 11, color: subtext, marginBottom: 2 },
  alertThreshold: { fontSize: 17, fontWeight: '700', color: white },
  textMuted: { color: tabIconDefault },
  alertActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  switchCompact: { transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] },
  deleteBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#2A1A1A',
    borderWidth: 1,
    borderColor: '#5A2020',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtnText: { fontSize: 16, color: '#E07070', lineHeight: 20, fontWeight: '300' },
  lastTriggered: {
    fontSize: 11,
    color: tabIconDefault,
    marginTop: 8,
    fontStyle: 'italic',
  },

  // État vide
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
    marginBottom: 8,
  },
  emptyIcon: { fontSize: 40, marginBottom: 16 },
  emptyTitle: { fontSize: 17, fontWeight: '600', color: white, marginBottom: 8 },
  emptyText: { fontSize: 14, color: subtext, textAlign: 'center', lineHeight: 22 },

  // Suggestions
  suggestionCard: {
    backgroundColor: card,
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  suggestionText: { fontSize: 14, color: white, flex: 1, lineHeight: 20 },
  suggestionAdd: { fontSize: 13, color: gold, fontWeight: '700', marginLeft: 8 },

  // Disclaimer
  disclaimer: {
    backgroundColor: '#111118',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: border,
  },
  disclaimerText: { fontSize: 11, color: tabIconDefault, lineHeight: 18 },
});
