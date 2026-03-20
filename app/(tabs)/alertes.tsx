import React, { useState, useEffect, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert as RNAlert,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  getAlerts,
  createAlert,
  deleteAlert,
  type Alert,
  type Condition,
} from '../../services/alerts'
import {
  type MetalType,
  METAL_CONFIG,
  getSpot,
} from '../../constants/metals'
import { OrTrackColors } from '../../constants/theme'
import { usePremium } from '../../contexts/premium-context'
import { useSpotPrices } from '../../hooks/use-spot-prices'

const METALS: MetalType[] = ['or', 'argent', 'platine', 'palladium', 'cuivre']

export default function AlertesScreen() {
  const [pushToken, setPushToken] = useState<string | null>(null)
  const [tokenLoading, setTokenLoading] = useState(true)
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [alertsLoading, setAlertsLoading] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [selectedMetal, setSelectedMetal] = useState<MetalType>(METALS[0])
  const [selectedCondition, setSelectedCondition] = useState<Condition>('above')
  const [targetPrice, setTargetPrice] = useState('')
  const [creating, setCreating] = useState(false)
  const [editingAlertId, setEditingAlertId] = useState<string | null>(null)
  const { prices } = useSpotPrices()
  const { canAddAlert, showPaywall, isPremium, limits } = usePremium()

  useEffect(() => {
    async function init() {
      setTokenLoading(true)
      const token = await AsyncStorage.getItem('@ortrack:push_token')
      setPushToken(token)
      setTokenLoading(false)
      if (token) loadAlerts(token)
    }
    init()
  }, [])

  async function loadAlerts(token: string) {
    setAlertsLoading(true)
    const data = await getAlerts(token)
    setAlerts(data)
    setAlertsLoading(false)
  }

  const openNewAlert = useCallback(() => {
    if (!canAddAlert(alerts.length)) {
      showPaywall()
      return
    }
    setEditingAlertId(null)
    setSelectedMetal(METALS[0])
    setSelectedCondition('above')
    setTargetPrice('')
    setModalVisible(true)
  }, [alerts.length, canAddAlert, showPaywall])

  const openEditAlert = useCallback((alert: Alert) => {
    setEditingAlertId(alert.id)
    setSelectedMetal(alert.metal)
    setSelectedCondition(alert.condition)
    setTargetPrice(String(alert.target_price))
    setModalVisible(true)
  }, [])

  const closeModal = useCallback(() => {
    setModalVisible(false)
    setEditingAlertId(null)
  }, [])

  async function handleCreate() {
    if (!pushToken || !targetPrice || isNaN(parseFloat(targetPrice))) return

    // Si création (pas édition), vérifier la limite premium
    if (!editingAlertId && !canAddAlert(alerts.length)) {
      closeModal()
      showPaywall()
      return
    }

    setCreating(true)

    // Si édition, supprimer l'ancienne alerte AVANT de créer la nouvelle
    if (editingAlertId) {
      await deleteAlert(editingAlertId)
    }

    const success = await createAlert(
      pushToken,
      selectedMetal,
      selectedCondition,
      parseFloat(targetPrice)
    )
    setCreating(false)
    if (success) {
      closeModal()
      setTargetPrice('')
      loadAlerts(pushToken)
    }
  }

  function handleDelete(alertId: string) {
    RNAlert.alert(
      "Supprimer l'alerte",
      'Cette alerte sera supprimée définitivement.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            await deleteAlert(alertId)
            if (pushToken) loadAlerts(pushToken)
          },
        },
      ]
    )
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>

        {/* HEADER */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Alertes</Text>
          {pushToken && (alertsLoading || alerts.length > 0) && (
            <TouchableOpacity
              onPress={openNewAlert}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={styles.headerPlus}>+</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* CAS 1 : chargement token */}
        {tokenLoading && (
          <ActivityIndicator
            color={OrTrackColors.gold}
            style={{ marginTop: 40 }}
          />
        )}

        {/* CAS 2 : pas de token */}
        {!tokenLoading && !pushToken && (
          <View style={styles.emptyState}>
            <Ionicons
              name="notifications-off-outline"
              size={48}
              color={OrTrackColors.subtext}
            />
            <Text style={styles.emptyTitle}>
              Notifications non disponibles
            </Text>
            <Text style={styles.emptySubtitle}>
              Testez sur un appareil physique
            </Text>
          </View>
        )}

        {/* CAS 3 : token disponible */}
        {!tokenLoading && pushToken && (
          <>
            {/* CTA pleine largeur quand 0 alertes (chargées) */}
            {!alertsLoading && alerts.length === 0 && (
              <TouchableOpacity
                style={styles.createButton}
                onPress={openNewAlert}
              >
                <Text style={styles.createButtonText}>+ Nouvelle alerte</Text>
              </TouchableOpacity>
            )}

            <View style={styles.alertsHeader}>
              <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>
                MES ALERTES
              </Text>
              {!isPremium && (
                <TouchableOpacity onPress={showPaywall} activeOpacity={0.7}>
                  <Text style={alerts.length >= limits.maxAlerts ? styles.alertsLimitFull : styles.alertsLimit}>
                    {alerts.length}/{limits.maxAlerts} · {alerts.length >= limits.maxAlerts ? 'Débloquer les alertes illimitées' : 'Passer à illimité'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {alertsLoading && (
              <ActivityIndicator color={OrTrackColors.gold} style={{ marginTop: 20 }} />
            )}

            {!alertsLoading && alerts.length === 0 && (
              <View style={styles.emptyAlerts}>
                <Ionicons
                  name="notifications-outline"
                  size={40}
                  color={OrTrackColors.subtext}
                />
                <Text style={styles.emptyAlertsTitle}>
                  Aucune alerte active
                </Text>
                <Text style={styles.emptyAlertsHint}>
                  Définissez un seuil de prix pour être notifié
                </Text>
                <Text style={styles.emptyAlertsExample}>
                  Ex : être alerté quand un métal atteint votre prix cible
                </Text>
              </View>
            )}

            {alerts.map((alert) => {
              const currentPrice = getSpot(alert.metal, prices)
              const isAbove = alert.condition === 'above'
              const isTriggered = currentPrice != null && (
                isAbove
                  ? currentPrice >= alert.target_price
                  : currentPrice <= alert.target_price
              )

              return (
                <View key={alert.id} style={[
                  styles.alertCard,
                  isTriggered && (isAbove ? styles.alertCardTriggeredAbove : styles.alertCardTriggeredBelow),
                ]}>
                  {/* Badge déclenchée */}
                  {isTriggered && (
                    <View style={styles.triggeredBadge}>
                      <Ionicons name="notifications" size={12} color={OrTrackColors.gold} />
                      <Text style={styles.triggeredText}>Déclenchée</Text>
                    </View>
                  )}

                  <View style={styles.alertInfo}>
                    {/* Ligne 1 : badge symbole + nom métal */}
                    <View style={styles.alertHeaderRow}>
                      <View style={[styles.metalBadge,
                        { borderColor: METAL_CONFIG[alert.metal].chipBorder }]}>
                        <Text style={[styles.metalBadgeText,
                          { color: METAL_CONFIG[alert.metal].chipText }]}>
                          {METAL_CONFIG[alert.metal].symbol}
                        </Text>
                      </View>
                      <Text style={styles.alertMetal}>
                        {METAL_CONFIG[alert.metal].name}
                      </Text>
                    </View>

                    {/* Ligne 2 : badge condition */}
                    <View style={styles.alertRow}>
                      <View style={[styles.conditionBadge, {
                        backgroundColor: isAbove
                          ? '#1B3A1B' : '#3A1B1B',
                      }]}>
                        <Text style={[styles.conditionText, {
                          color: isAbove
                            ? '#4CAF50' : '#F44336',
                        }]}>
                          {isAbove ? '▲ Au-dessus' : '▼ En-dessous'}
                        </Text>
                      </View>
                    </View>

                    {/* Bloc cours + seuil + écart + barre */}
                    {(() => {
                      if (currentPrice == null) return (
                        <Text style={styles.alertPrice}>
                          Seuil : {alert.target_price.toLocaleString('fr-FR',
                            { maximumFractionDigits: 2 })} {'€'}/oz
                        </Text>
                      )

                      const gap = alert.target_price - currentPrice
                      const gapPct = (gap / currentPrice) * 100
                      const proximityRaw = isAbove
                        ? currentPrice / alert.target_price
                        : alert.target_price / currentPrice
                      const proximity = Math.min(Math.max(proximityRaw, 0), 1)

                      return (
                        <>
                          <View style={styles.priceGrid}>
                            <View style={styles.priceGridItem}>
                              <Text style={styles.priceGridLabel}>Cours actuel</Text>
                              <Text style={styles.priceGridValue}>
                                {currentPrice.toLocaleString('fr-FR',
                                  { maximumFractionDigits: 2 })} {'€'}/oz
                              </Text>
                            </View>
                            <View style={styles.priceGridItem}>
                              <Text style={styles.priceGridLabel}>Seuil cible</Text>
                              <Text style={[styles.priceGridValue,
                                { color: OrTrackColors.gold }]}>
                                {alert.target_price.toLocaleString('fr-FR',
                                  { maximumFractionDigits: 2 })} {'€'}/oz
                              </Text>
                            </View>
                          </View>

                          <Text style={[styles.gapText, {
                            color: isAbove
                              ? (gap > 0 ? OrTrackColors.subtext : '#4CAF50')
                              : (gap < 0 ? OrTrackColors.subtext : '#F44336'),
                          }]}>
                            Écart : {gap > 0 ? '+' : ''}
                            {gap.toLocaleString('fr-FR', { maximumFractionDigits: 2 })}
                            {' €'} ({gapPct > 0 ? '+' : ''}
                            {gapPct.toFixed(1)} %)
                          </Text>

                          <View style={styles.proximityBarBg}>
                            <View style={[styles.proximityBarFill, {
                              width: `${(proximity * 100).toFixed(1)}%` as any,
                              backgroundColor: isTriggered
                                ? (isAbove ? '#4CAF50' : '#F44336')
                                : (isAbove ? OrTrackColors.gold : '#F44336'),
                            }]} />
                          </View>
                          <Text style={styles.proximityLabel}>
                            {(proximity * 100).toFixed(0)} % du seuil atteint
                          </Text>
                        </>
                      )
                    })()}
                  </View>

                  {/* Footer : Modifier + Supprimer */}
                  <View style={styles.alertCardFooter}>
                    <TouchableOpacity
                      onPress={() => openEditAlert(alert)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.editLabel}>Modifier</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleDelete(alert.id)}
                      style={styles.deleteButton}
                    >
                      <Ionicons
                        name="trash-outline"
                        size={20}
                        color={OrTrackColors.subtext}
                      />
                    </TouchableOpacity>
                  </View>
                </View>
              )
            })}
          </>
        )}
      </ScrollView>

      {/* MODAL CRÉATION / ÉDITION */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={closeModal}
      >
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
          >
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>
                {editingAlertId ? "Modifier l'alerte" : 'Nouvelle alerte'}
              </Text>

              {/* Sélecteur métal */}
              <Text style={styles.inputLabel}>MÉTAL</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ marginBottom: 16 }}
                contentContainerStyle={{ paddingRight: 16 }}
              >
                {METALS.map((metal) => (
                  <TouchableOpacity
                    key={metal}
                    onPress={() => setSelectedMetal(metal)}
                    style={[
                      styles.metalChip,
                      {
                        backgroundColor:
                          selectedMetal === metal
                            ? OrTrackColors.gold
                            : OrTrackColors.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.metalChipText,
                        {
                          color:
                            selectedMetal === metal ? '#000000' : OrTrackColors.white,
                        },
                      ]}
                    >
                      {METAL_CONFIG[metal].name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Sélecteur condition */}
              <Text style={styles.inputLabel}>CONDITION</Text>
              <View style={styles.conditionRow}>
                <TouchableOpacity
                  style={[
                    styles.conditionButton,
                    {
                      backgroundColor:
                        selectedCondition === 'above'
                          ? OrTrackColors.gold
                          : OrTrackColors.border,
                      marginRight: 8,
                    },
                  ]}
                  onPress={() => setSelectedCondition('above')}
                >
                  <Text
                    style={{
                      color:
                        selectedCondition === 'above' ? '#000000' : OrTrackColors.white,
                      textAlign: 'center',
                    }}
                  >
                    ▲ Au-dessus
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.conditionButton,
                    {
                      backgroundColor:
                        selectedCondition === 'below'
                          ? OrTrackColors.gold
                          : OrTrackColors.border,
                    },
                  ]}
                  onPress={() => setSelectedCondition('below')}
                >
                  <Text
                    style={{
                      color:
                        selectedCondition === 'below' ? '#000000' : OrTrackColors.white,
                      textAlign: 'center',
                    }}
                  >
                    ▼ En-dessous
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Input prix */}
              <Text style={[styles.inputLabel, { marginTop: 16 }]}>
                PRIX CIBLE
              </Text>
              {(() => {
                const spot = getSpot(selectedMetal, prices)
                if (!spot) return null
                return (
                  <View style={styles.spotHintRow}>
                    <Ionicons
                      name="pulse-outline"
                      size={13}
                      color={OrTrackColors.gold}
                    />
                    <Text style={styles.spotHintText}>
                      Cours actuel :{' '}
                      <Text style={{ color: OrTrackColors.white, fontWeight: '700' }}>
                        {spot.toLocaleString('fr-FR',
                          { maximumFractionDigits: 2 })} {'€'}/oz
                      </Text>
                    </Text>
                  </View>
                )
              })()}
              <View style={styles.priceInputRow}>
                <TextInput
                  style={styles.priceInput}
                  value={targetPrice}
                  onChangeText={setTargetPrice}
                  keyboardType="numeric"
                  placeholder="ex: 4500"
                  placeholderTextColor={OrTrackColors.subtext}
                />
                <Text style={styles.priceUnit}>€/oz</Text>
              </View>

              {/* Boutons */}
              <TouchableOpacity
                style={[
                  styles.confirmButton,
                  { opacity: creating || !targetPrice ? 0.5 : 1 },
                ]}
                onPress={handleCreate}
                disabled={creating || !targetPrice}
              >
                {creating ? (
                  <ActivityIndicator color="#000000" />
                ) : (
                  <Text style={styles.confirmButtonText}>
                    {editingAlertId ? "Modifier l'alerte" : "Créer l'alerte"}
                  </Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.cancelButton}
                onPress={closeModal}
              >
                <Text style={styles.cancelButtonText}>Annuler</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: OrTrackColors.background },
  content: { padding: 16, paddingBottom: 90 },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: OrTrackColors.white,
  },
  headerPlus: {
    fontSize: 28,
    fontWeight: '300',
    color: OrTrackColors.gold,
  },

  // Empty states
  emptyState: { alignItems: 'center', marginTop: 60 },
  emptyTitle: {
    color: OrTrackColors.subtext,
    fontSize: 16,
    marginTop: 16,
    fontWeight: '600',
  },
  emptySubtitle: { color: OrTrackColors.subtext, fontSize: 12, marginTop: 8 },

  // CTA full-width (0 alertes)
  createButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: OrTrackColors.gold,
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    marginBottom: 24,
  },
  createButtonText: {
    color: OrTrackColors.gold,
    fontWeight: '600',
    fontSize: 15,
  },

  // Section header
  sectionTitle: {
    fontSize: 11,
    color: OrTrackColors.gold,
    fontWeight: 'bold',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  alertsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  alertsLimit: {
    fontSize: 11,
    color: OrTrackColors.subtext,
    fontWeight: '600',
  },
  alertsLimitFull: {
    fontSize: 11,
    color: OrTrackColors.gold,
    fontWeight: '600',
  },

  // Empty alerts
  emptyAlerts: {
    alignItems: 'center',
    marginTop: 40,
    gap: 8,
  },
  emptyAlertsTitle: {
    color: OrTrackColors.subtext,
    fontSize: 14,
    fontWeight: '600',
    marginTop: 8,
  },
  emptyAlertsHint: {
    color: OrTrackColors.subtext,
    fontSize: 12,
    opacity: 0.6,
    textAlign: 'center',
  },
  emptyAlertsExample: {
    color: OrTrackColors.subtext,
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 8,
    textAlign: 'center',
  },

  // Alert card
  alertCard: {
    backgroundColor: OrTrackColors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: OrTrackColors.border,
    padding: 14,
    marginBottom: 10,
  },
  alertCardTriggeredAbove: {
    backgroundColor: 'rgba(76, 175, 80, 0.08)',
  },
  alertCardTriggeredBelow: {
    backgroundColor: 'rgba(229, 115, 115, 0.08)',
  },
  triggeredBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    gap: 4,
    marginBottom: 8,
  },
  triggeredText: {
    fontSize: 11,
    fontWeight: '600',
    color: OrTrackColors.gold,
  },
  alertInfo: { flex: 1 },
  alertHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  metalBadge: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  metalBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  alertMetal: {
    color: OrTrackColors.white,
    fontWeight: 'bold',
    fontSize: 15,
  },
  alertRow: { flexDirection: 'row', marginBottom: 6 },
  conditionBadge: {
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  conditionText: { fontSize: 12, fontWeight: '600' },
  alertPrice: {
    color: OrTrackColors.gold,
    fontSize: 14,
    fontWeight: '600',
  },
  alertCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: OrTrackColors.border,
  },
  editLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: OrTrackColors.gold,
  },
  deleteButton: { padding: 8 },

  // Price grid
  priceGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    marginBottom: 6,
  },
  priceGridItem: {
    flex: 1,
  },
  priceGridLabel: {
    color: OrTrackColors.subtext,
    fontSize: 10,
    marginBottom: 2,
  },
  priceGridValue: {
    color: OrTrackColors.white,
    fontSize: 13,
    fontWeight: '600',
  },
  gapText: {
    fontSize: 11,
    marginBottom: 8,
  },
  proximityBarBg: {
    height: 4,
    backgroundColor: OrTrackColors.border,
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 4,
  },
  proximityBarFill: {
    height: 4,
    borderRadius: 2,
  },
  proximityLabel: {
    color: OrTrackColors.subtext,
    fontSize: 10,
    textAlign: 'right',
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: OrTrackColors.card,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 24,
    paddingBottom: 40,
  },
  modalTitle: {
    color: OrTrackColors.white,
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  inputLabel: {
    color: OrTrackColors.gold,
    fontSize: 11,
    fontWeight: 'bold',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  metalChip: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
  },
  metalChipText: { fontSize: 13, fontWeight: '600' },
  conditionRow: { flexDirection: 'row', marginBottom: 8 },
  conditionButton: {
    flex: 1,
    borderRadius: 8,
    padding: 12,
  },
  priceInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: OrTrackColors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  priceInput: {
    flex: 1,
    color: OrTrackColors.white,
    fontSize: 16,
  },
  priceUnit: { color: OrTrackColors.subtext, marginLeft: 8 },
  confirmButton: {
    backgroundColor: OrTrackColors.gold,
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginTop: 20,
  },
  confirmButtonText: {
    color: '#000000',
    fontWeight: 'bold',
    fontSize: 15,
  },
  cancelButton: { padding: 12, alignItems: 'center', marginTop: 4 },
  cancelButtonText: { color: OrTrackColors.subtext, fontSize: 14 },
  spotHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: OrTrackColors.background,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 8,
  },
  spotHintText: {
    color: OrTrackColors.subtext,
    fontSize: 12,
  },
})
