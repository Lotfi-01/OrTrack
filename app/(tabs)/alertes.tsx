import React, { useState, useEffect, useCallback, useRef } from 'react'
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
  Linking,
  AppState,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useLocalSearchParams } from 'expo-router'
import { useFocusEffect } from '@react-navigation/native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Notifications from 'expo-notifications'
import {
  getAlerts,
  createAlert,
  deleteAlert,
  updateAlert,
  createLegacyNotificationTokenAlertScope,
  migrateLegacyAlertsToNewToken,
  type Alert,
  type Condition,
  type LegacyNotificationTokenAlertScope,
} from '../../services/alerts'
import {
  type MetalType,
  METAL_CONFIG,
  getSpot,
} from '../../constants/metals'
import { OrTrackColors } from '../../constants/theme'
import { usePremium } from '../../contexts/premium-context'
import { useSpotPrices } from '../../hooks/use-spot-prices'
import { formatEuro } from '@/utils/format'
import { STORAGE_KEYS } from '@/constants/storage-keys'
import {
  registerForPushNotifications,
  getCurrentPermissionStatus,
  refreshCurrentPushToken,
  type NotificationPermissionStatus,
} from '@/services/notifications'
import { reportError } from '@/utils/error-reporting'

const METALS: MetalType[] = ['or', 'argent', 'platine', 'palladium']

function parseTargetPriceInput(value: string): number | null {
  const parsed = Number(value.trim().replace(',', '.'))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

export default function AlertesScreen() {
  const params = useLocalSearchParams<{ metal?: string }>()
  // Expo notification token: transport only. Backend v1 still uses it as a
  // legacy alert access scope until real ownership/RLS/RPC exists.
  const [notificationToken, setNotificationToken] = useState<string | null>(null)
  const [tokenLoading, setTokenLoading] = useState(true)
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [alertsLoading, setAlertsLoading] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [selectedMetal, setSelectedMetal] = useState<MetalType>(METALS[0])
  const [selectedCondition, setSelectedCondition] = useState<Condition>('above')
  const [targetPrice, setTargetPrice] = useState('')
  const [creating, setCreating] = useState(false)
  const [editingAlertId, setEditingAlertId] = useState<string | null>(null)
  const [permissionStatus, setPermissionStatus] = useState<NotificationPermissionStatus | null>(null)
  const { pricesEur: alertPricesEur } = useSpotPrices()
  const { canAddAlert, showPaywall, isPremium, limits } = usePremium()
  const didAutoOpen = useRef(false)

  // Préremplissage depuis param Accueil (metal = symbole ISO ex: 'XAU')
  useEffect(() => {
    if (didAutoOpen.current) return
    const sym = params.metal
    if (!sym || !notificationToken || tokenLoading) return
    // Mappe symbole ISO → MetalType key
    const entry = METALS.find(k => METAL_CONFIG[k].symbol === sym)
    const m = entry ?? (METALS.includes(sym as MetalType) ? sym as MetalType : undefined)
    if (!m) return
    {
      didAutoOpen.current = true
      setSelectedMetal(m)
      setEditingAlertId(null)
      setSelectedCondition('above')
      setTargetPrice('')
      setModalVisible(true)
    }
  }, [params.metal, notificationToken, tokenLoading])

  useEffect(() => {
    async function init() {
      setTokenLoading(true)
      try {
        const storedNotificationToken = await AsyncStorage.getItem(STORAGE_KEYS.notificationToken)
        setNotificationToken(storedNotificationToken)
        const legacyScope = createLegacyNotificationTokenAlertScope(storedNotificationToken)
        if (legacyScope) await loadAlerts(legacyScope)
      } catch (error) {
        reportError(error, { scope: 'alerts', action: 'load_notification_token' })
      } finally {
        setTokenLoading(false)
      }
    }
    init()
  }, [])

  async function loadAlerts(scope: LegacyNotificationTokenAlertScope) {
    setAlertsLoading(true)
    try {
      const data = await getAlerts(scope)
      setAlerts(data)
    } catch (error) {
      reportError(error, { scope: 'alerts', action: 'load_alerts' })
      setAlerts([])
    } finally {
      setAlertsLoading(false)
    }
  }

  // Reconciles OS permission state and silently detects Expo push token
  // rotation. Drives the permission banner and, on rotation, transfers legacy
  // alerts from the previous token to the current one before reloading the
  // list. Safe to call on mount, on screen focus and on foreground
  // transitions; does not prompt the user.
  const reconcilePushStatus = useCallback(async () => {
    const status = await getCurrentPermissionStatus()
    setPermissionStatus(status)
    if (status.state !== 'granted') return

    try {
      const refresh = await refreshCurrentPushToken()
      if (refresh.outcome !== 'rotated') return

      await migrateLegacyAlertsToNewToken(refresh.previous, refresh.current)
      setNotificationToken(refresh.current)
      const scope = createLegacyNotificationTokenAlertScope(refresh.current)
      if (!scope) return

      setAlertsLoading(true)
      try {
        const data = await getAlerts(scope)
        setAlerts(data)
      } catch (error) {
        reportError(error, { scope: 'alerts', action: 'reload_after_rotation' })
        setAlerts([])
      } finally {
        setAlertsLoading(false)
      }
    } catch (error) {
      reportError(error, { scope: 'alerts', action: 'reconcile_push_status' })
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      void reconcilePushStatus()
    }, [reconcilePushStatus])
  )

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') void reconcilePushStatus()
    })
    return () => sub.remove()
  }, [reconcilePushStatus])

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
    const parsedTargetPrice = parseTargetPriceInput(targetPrice)
    if (parsedTargetPrice == null) {
      RNAlert.alert('Prix cible invalide', 'Saisissez un prix cible supérieur à zéro.')
      return
    }

    // Obtenir un token de notification si absent (demande de permission à ce moment)
    let currentNotificationToken = notificationToken
    if (!currentNotificationToken) {
      currentNotificationToken = await registerForPushNotifications()
      if (currentNotificationToken) {
        setNotificationToken(currentNotificationToken)
        void reconcilePushStatus()
      } else {
        // Permission refusée — vérifier si refus définitif
        try {
          const { canAskAgain } = await Notifications.getPermissionsAsync()
          if (!canAskAgain) {
            RNAlert.alert(
              'Notifications bloquées',
              'Les notifications sont désactivées pour OrTrack. Activez-les dans les réglages de votre appareil pour recevoir vos alertes de prix.',
              [
                {
                  text: 'Ouvrir les réglages',
                  onPress: () => {
                    Linking.openSettings().catch(error => {
                      reportError(error, { scope: 'alerts', action: 'open_notification_settings' })
                    })
                  },
                },
                { text: 'Annuler', style: 'cancel' },
              ]
            )
          } else {
            RNAlert.alert(
              'Notifications requises',
              'Les alertes de prix nécessitent l\u2019autorisation des notifications pour vous prévenir.',
              [{ text: 'Compris' }]
            )
          }
        } catch (error) {
          reportError(error, { scope: 'alerts', action: 'read_notification_permission_details' })
          RNAlert.alert(
            'Notifications requises',
            'Impossible d\u2019activer les notifications. Réessayez.',
            [{ text: 'OK' }]
          )
        }
        return
      }
    }

    const legacyScope = createLegacyNotificationTokenAlertScope(currentNotificationToken)
    if (!legacyScope) {
      RNAlert.alert(
        'Alerte impossible',
        'Cette version ne peut pas enregistrer une alerte serveur sans token de notification valide.'
      )
      return
    }

    // Si création (pas édition), vérifier la limite premium
    if (!editingAlertId && !canAddAlert(alerts.length)) {
      closeModal()
      showPaywall()
      return
    }

    setCreating(true)

    try {
      let success: boolean
      if (editingAlertId) {
        const result = await updateAlert(legacyScope, editingAlertId, {
          metal: selectedMetal,
          condition: selectedCondition,
          target_price: parsedTargetPrice,
        })
        success = result.success
      } else {
        success = await createAlert(
          legacyScope,
          selectedMetal,
          selectedCondition,
          parsedTargetPrice,
        )
      }

      if (success) {
        closeModal()
        setTargetPrice('')
        await loadAlerts(legacyScope)
      } else {
        RNAlert.alert('Alerte impossible', 'L’alerte n’a pas pu être enregistrée. Réessayez.')
      }
    } catch (error) {
      reportError(error, { scope: 'alerts', action: 'save_alert' })
      RNAlert.alert('Alerte impossible', 'L’alerte n’a pas pu être enregistrée. Réessayez.')
    } finally {
      setCreating(false)
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
            const legacyScope = createLegacyNotificationTokenAlertScope(notificationToken)
            if (!legacyScope) {
              RNAlert.alert(
                'Suppression impossible',
                'Cette version ne peut supprimer une alerte serveur que si le token de notification local est encore disponible.'
              )
              return
            }
            try {
              const result = await deleteAlert(legacyScope, alertId)
              if (result.success) {
                await loadAlerts(legacyScope)
              } else {
                RNAlert.alert('Suppression impossible', 'Cette alerte n’a pas pu être supprimée. Réessayez.')
              }
            } catch (error) {
              reportError(error, { scope: 'alerts', action: 'delete_alert', metadata: { alertId } })
              RNAlert.alert('Suppression impossible', 'Cette alerte n’a pas pu être supprimée. Réessayez.')
            }
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
        </View>

        {/* Bandeau d'état permissions notifications — ne s'affiche que si l'OS
            bloque ou si l'état n'est pas lisible. 'undetermined' reste silencieux. */}
        {permissionStatus && (permissionStatus.state === 'denied' || permissionStatus.state === 'unavailable') && (
          <View style={styles.permissionBanner}>
            <Ionicons
              name={permissionStatus.state === 'denied' ? 'notifications-off-outline' : 'help-circle-outline'}
              size={18}
              color={'#E07070'}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.permissionBannerTitle}>
                {permissionStatus.state === 'denied'
                  ? 'Notifications désactivées'
                  : 'État des notifications inconnu'}
              </Text>
              <Text style={styles.permissionBannerSub}>
                {permissionStatus.state === 'denied'
                  ? 'Vos alertes ne peuvent pas vous prévenir tant qu\u2019elles restent bloquées par l\u2019appareil.'
                  : 'Impossible de v\u00E9rifier l\u2019\u00E9tat des notifications sur cet appareil.'}
              </Text>
            </View>
            {permissionStatus.state === 'denied' && (
              <TouchableOpacity
                style={styles.permissionBannerCta}
                onPress={() => {
                  Linking.openSettings().catch(error => {
                    reportError(error, { scope: 'alerts', action: 'open_notification_settings_from_banner' })
                  })
                }}
              >
                <Text style={styles.permissionBannerCtaText}>Réglages</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* CAS 1 : chargement token */}
        {tokenLoading && (
          <ActivityIndicator
            color={OrTrackColors.gold}
            style={{ marginTop: 40 }}
          />
        )}

        {/* CAS 2+3 : afficher l'interface alertes que le token soit présent ou non.
             La permission push sera demandée à la création d'une alerte si nécessaire. */}
        {!tokenLoading && (
          <>
            {/* CTA pleine largeur — adapté au quota */}
            {!alertsLoading && (
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
                <Text style={styles.alertsLimit}>
                  {alerts.length}/{limits.maxAlerts} utilisée{alerts.length === 1 ? '' : 's'}
                  {!canAddAlert(alerts.length) && ` ${'\u00B7'} Limite atteinte`}
                </Text>
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
                  Définissez un seuil. L{'\u2019'}app vous prévient avant le niveau visé.
                </Text>
                <Text style={styles.emptyAlertsExample}>
                  Ex : être alerté si l{'\u2019'}or dépasse 5 000 {'\u20AC'}/oz
                </Text>
              </View>
            )}

            {[...alerts].sort((a, b) => {
              const pa = getSpot(a.metal, alertPricesEur)
              const pb = getSpot(b.metal, alertPricesEur)
              if (pa == null && pb == null) return 0
              if (pa == null) return 1
              if (pb == null) return -1
              const gapA = a.target_price > 0 ? Math.abs(pa - a.target_price) / a.target_price : Infinity
              const gapB = b.target_price > 0 ? Math.abs(pb - b.target_price) / b.target_price : Infinity
              return gapA - gapB // smallest relative gap first (closest to trigger)
            }).map((alert) => {
              const currentPrice = getSpot(alert.metal, alertPricesEur)
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
                          Seuil : {formatEuro(alert.target_price)} {'€'}/oz
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
                              <Text style={styles.priceGridLabel}>Cours spot</Text>
                              <Text style={styles.priceGridValue}>
                                {formatEuro(currentPrice)} {'€'}/oz
                              </Text>
                            </View>
                            <View style={styles.priceGridItem}>
                              <Text style={styles.priceGridLabel}>Seuil cible</Text>
                              <Text style={[styles.priceGridValue,
                                { color: OrTrackColors.gold }]}>
                                {formatEuro(alert.target_price)} {'€'}/oz
                              </Text>
                            </View>
                          </View>

                          <Text style={[styles.gapText, {
                            color: isAbove
                              ? (gap > 0 ? OrTrackColors.textDim : '#4CAF50')
                              : (gap < 0 ? OrTrackColors.textDim : '#F44336'),
                          }]}>
                            {isAbove
                              ? `Encore ${formatEuro(Math.abs(gap))} \u20AC/oz avant l\u2019alerte`
                              : `${formatEuro(Math.abs(gap))} \u20AC/oz de baisse avant l\u2019alerte`}
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
                        size={18}
                        color={OrTrackColors.textDim}
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
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
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
                style={{ marginBottom: 12, marginHorizontal: -20 }}
                contentContainerStyle={{ paddingLeft: 20, paddingRight: 48 }}
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
              <Text style={[styles.inputLabel, { marginTop: 12 }]}>
                PRIX CIBLE
              </Text>
              {(() => {
                const spot = getSpot(selectedMetal, alertPricesEur)
                if (!spot) return null
                return (
                  <View style={styles.spotHintRow}>
                    <Ionicons
                      name="pulse-outline"
                      size={13}
                      color={OrTrackColors.gold}
                    />
                    <Text style={styles.spotHintText}>
                      Cours spot :{' '}
                      <Text style={{ color: OrTrackColors.white, fontWeight: '700' }}>
                        {formatEuro(spot)} {'€'}/oz
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

              {/* Validation + Boutons */}
              {(() => {
                const spot = getSpot(selectedMetal, alertPricesEur)
                const parsed = parseTargetPriceInput(targetPrice)
                const hasValue = parsed != null
                const isValid = hasValue && spot != null && (
                  selectedCondition === 'above' ? parsed > spot : parsed < spot
                )
                const showError = hasValue && spot != null && !isValid
                const canCreate = hasValue && isValid && !creating

                return (
                  <>
                    {showError && (
                      <Text style={styles.validationError}>
                        {selectedCondition === 'above'
                          ? 'Le seuil doit être supérieur au cours actuel'
                          : 'Le seuil doit être inférieur au cours actuel'}
                      </Text>
                    )}
                    <TouchableOpacity
                      style={[
                        styles.confirmButton,
                        !canCreate && styles.confirmButtonDisabled,
                      ]}
                      onPress={handleCreate}
                      disabled={!canCreate}
                    >
                      {creating ? (
                        <ActivityIndicator color="#000000" />
                      ) : (
                        <Text style={[
                          styles.confirmButtonText,
                          !canCreate && styles.confirmButtonTextDisabled,
                        ]}>
                          {editingAlertId ? "Modifier l'alerte" : "Créer l'alerte"}
                        </Text>
                      )}
                    </TouchableOpacity>
                  </>
                )
              })()}

              <Text style={styles.modalReassurance}>Notification envoyée quand le seuil est atteint</Text>

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

  // Permission banner
  permissionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(224,112,112,0.08)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(224,112,112,0.3)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
  },
  permissionBannerTitle: {
    color: OrTrackColors.white,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 2,
  },
  permissionBannerSub: {
    color: OrTrackColors.subtext,
    fontSize: 11,
    lineHeight: 15,
  },
  permissionBannerCta: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: OrTrackColors.gold,
  },
  permissionBannerCtaText: {
    color: OrTrackColors.gold,
    fontSize: 12,
    fontWeight: '600',
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
  createButtonPremium: {
    backgroundColor: 'rgba(201,168,76,0.08)',
    borderColor: OrTrackColors.gold,
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
  alertsLimitAccent: {
    color: OrTrackColors.gold,
    fontWeight: '700',
    fontSize: 12,
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
    color: OrTrackColors.textDim,
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
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
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: OrTrackColors.border,
  },
  editLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: OrTrackColors.gold,
  },
  deleteButton: { padding: 10, minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(224,112,112,0.06)', borderRadius: 8 },

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
    color: OrTrackColors.textDim,
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
    padding: 20,
    paddingBottom: 36,
  },
  modalTitle: {
    color: OrTrackColors.white,
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
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
    marginTop: 16,
  },
  confirmButtonText: {
    color: '#000000',
    fontWeight: 'bold',
    fontSize: 15,
  },
  cancelButton: { padding: 10, alignItems: 'center', marginTop: 2 },
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
  validationError: {
    color: '#E07070',
    fontSize: 11,
    marginTop: 8,
    marginBottom: -4,
  },
  confirmButtonDisabled: {
    backgroundColor: OrTrackColors.border,
    opacity: 0.6,
  },
  confirmButtonTextDisabled: {
    color: OrTrackColors.subtext,
  },
  modalReassurance: {
    color: OrTrackColors.textDim,
    fontSize: 11,
    textAlign: 'center',
    marginTop: 6,
  },
})
