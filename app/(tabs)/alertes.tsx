import React, { useState, useEffect } from 'react'
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
} from '../../constants/metals'
import { OrTrackColors } from '../../constants/theme'

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

  async function handleCreate() {
    if (!pushToken || !targetPrice || isNaN(parseFloat(targetPrice))) return
    setCreating(true)
    const success = await createAlert(
      pushToken,
      selectedMetal,
      selectedCondition,
      parseFloat(targetPrice)
    )
    setCreating(false)
    if (success) {
      setModalVisible(false)
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
          <Text style={styles.headerBrand}>ORTRACK</Text>
          <Text style={styles.headerTab}>Alertes</Text>
        </View>

        {/* CAS 1 : chargement token */}
        {tokenLoading && (
          <ActivityIndicator
            color="#C9A84C"
            style={{ marginTop: 40 }}
          />
        )}

        {/* CAS 2 : pas de token */}
        {!tokenLoading && !pushToken && (
          <View style={styles.emptyState}>
            <Ionicons
              name="notifications-off-outline"
              size={48}
              color="#888888"
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
            <TouchableOpacity
              style={styles.createButton}
              onPress={() => setModalVisible(true)}
            >
              <Text style={styles.createButtonText}>＋ Nouvelle alerte</Text>
            </TouchableOpacity>

            <Text style={styles.sectionTitle}>MES ALERTES</Text>

            {alertsLoading && (
              <ActivityIndicator color="#C9A84C" style={{ marginTop: 20 }} />
            )}

            {!alertsLoading && alerts.length === 0 && (
              <Text style={styles.noAlerts}>Aucune alerte active</Text>
            )}

            {alerts.map((alert) => (
              <View key={alert.id} style={styles.alertCard}>
                <View style={styles.alertCardContent}>
                  <View style={styles.alertInfo}>
                    <Text style={styles.alertMetal}>
                      {METAL_CONFIG[alert.metal].name}
                    </Text>
                    <View style={styles.alertRow}>
                      <View
                        style={[
                          styles.conditionBadge,
                          {
                            backgroundColor:
                              alert.condition === 'above'
                                ? '#1B3A1B'
                                : '#3A1B1B',
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.conditionText,
                            {
                              color:
                                alert.condition === 'above'
                                  ? '#4CAF50'
                                  : '#F44336',
                            },
                          ]}
                        >
                          {alert.condition === 'above'
                            ? '▲ Au-dessus'
                            : '▼ En-dessous'}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.alertPrice}>
                      {alert.target_price.toLocaleString('fr-FR')} €/oz
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => handleDelete(alert.id)}
                    style={styles.deleteButton}
                  >
                    <Ionicons
                      name="trash-outline"
                      size={20}
                      color="#888888"
                    />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </>
        )}
      </ScrollView>

      {/* MODAL CRÉATION */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
          >
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Nouvelle alerte</Text>

              {/* Sélecteur métal */}
              <Text style={styles.inputLabel}>MÉTAL</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ marginBottom: 16 }}
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
                            ? '#C9A84C'
                            : '#2A2A2A',
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.metalChipText,
                        {
                          color:
                            selectedMetal === metal ? '#000000' : '#FFFFFF',
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
                          ? '#C9A84C'
                          : '#2A2A2A',
                      marginRight: 8,
                    },
                  ]}
                  onPress={() => setSelectedCondition('above')}
                >
                  <Text
                    style={{
                      color:
                        selectedCondition === 'above' ? '#000000' : '#FFFFFF',
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
                          ? '#C9A84C'
                          : '#2A2A2A',
                    },
                  ]}
                  onPress={() => setSelectedCondition('below')}
                >
                  <Text
                    style={{
                      color:
                        selectedCondition === 'below' ? '#000000' : '#FFFFFF',
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
              <View style={styles.priceInputRow}>
                <TextInput
                  style={styles.priceInput}
                  value={targetPrice}
                  onChangeText={setTargetPrice}
                  keyboardType="numeric"
                  placeholder="ex: 4500"
                  placeholderTextColor="#888888"
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
                  <Text style={styles.confirmButtonText}>Créer l'alerte</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setModalVisible(false)}
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
  content: { padding: 16, paddingBottom: 32 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  headerBrand: {
    fontSize: 13,
    color: '#C9A84C',
    fontWeight: 'bold',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  headerTab: { fontSize: 13, color: '#888888' },
  emptyState: { alignItems: 'center', marginTop: 60 },
  emptyTitle: {
    color: '#888888',
    fontSize: 16,
    marginTop: 16,
    fontWeight: '600',
  },
  emptySubtitle: { color: '#888888', fontSize: 12, marginTop: 8 },
  createButton: {
    backgroundColor: '#C9A84C',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    marginBottom: 24,
  },
  createButtonText: {
    color: '#000000',
    fontWeight: 'bold',
    fontSize: 15,
  },
  sectionTitle: {
    fontSize: 11,
    color: '#C9A84C',
    fontWeight: 'bold',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  noAlerts: {
    color: '#888888',
    textAlign: 'center',
    marginTop: 20,
    fontSize: 14,
  },
  alertCard: {
    backgroundColor: '#1A1A1A',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    padding: 14,
    marginBottom: 10,
  },
  alertCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  alertInfo: { flex: 1 },
  alertMetal: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 15,
    marginBottom: 6,
  },
  alertRow: { flexDirection: 'row', marginBottom: 6 },
  conditionBadge: {
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  conditionText: { fontSize: 12, fontWeight: '600' },
  alertPrice: {
    color: '#C9A84C',
    fontSize: 14,
    fontWeight: '600',
  },
  deleteButton: { padding: 8 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1A1A1A',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 24,
    paddingBottom: 40,
  },
  modalTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  inputLabel: {
    color: '#C9A84C',
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
    backgroundColor: '#2A2A2A',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  priceInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 16,
  },
  priceUnit: { color: '#888888', marginLeft: 8 },
  confirmButton: {
    backgroundColor: '#C9A84C',
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
  cancelButtonText: { color: '#888888', fontSize: 14 },
})
