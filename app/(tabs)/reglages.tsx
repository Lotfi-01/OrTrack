import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path } from 'react-native-svg';
import * as LocalAuthentication from 'expo-local-authentication';
import { SafeAreaView } from 'react-native-safe-area-context';
import { usePremium } from '@/contexts/premium-context';

import { OrTrackColors } from '@/constants/theme';

// ─── Clés AsyncStorage ────────────────────────────────────────────────────────

const PROFILE_KEY = '@ortrack:profil';
const SETTINGS_KEY = '@ortrack:settings';
const POSITIONS_KEY = '@ortrack:positions';

// ─── Types ────────────────────────────────────────────────────────────────────

type Currency = 'EUR' | 'USD' | 'CHF';
type RefreshInterval = 5 | 15 | 30;

type AppSettings = {
  currency: Currency;
  autoRefresh: boolean;
  refreshInterval: RefreshInterval;
  notifPriceAlert: boolean;
  notifDailyVariation: boolean;
  notifWeeklyReport: boolean;
};

const DEFAULT_SETTINGS: AppSettings = {
  currency: 'EUR',
  autoRefresh: true,
  refreshInterval: 15,
  notifPriceAlert: false,
  notifDailyVariation: false,
  notifWeeklyReport: false,
};

// ─── Sous-composants ──────────────────────────────────────────────────────────

function SectionTitle({ title }: { title: string }) {
  return <Text style={styles.sectionTitle}>{title}</Text>;
}

function ItemSeparator() {
  return <View style={styles.separator} />;
}

function ToggleRow({
  label,
  sublabel,
  value,
  onChange,
}: {
  label: string;
  sublabel?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.rowLeft}>
        <Text style={styles.rowLabel}>{label}</Text>
        {sublabel ? <Text style={styles.rowSub}>{sublabel}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: OrTrackColors.border, true: OrTrackColors.gold }}
        thumbColor={value ? OrTrackColors.background : OrTrackColors.tabIconDefault}
        ios_backgroundColor={OrTrackColors.border}
      />
    </View>
  );
}

function SegmentRow<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { label: string; value: T }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.segmentRow}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.segmentGroup}>
        {options.map((opt) => {
          const active = opt.value === value;
          return (
            <TouchableOpacity
              key={String(opt.value)}
              onPress={() => onChange(opt.value)}
              activeOpacity={0.75}
              style={[styles.segmentBtn, active && styles.segmentBtnActive]}>
              <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function ActionRow({
  label,
  iconName,
  color,
  onPress,
}: {
  label: string;
  iconName: string;
  color?: string;
  onPress: () => void;
}) {
  const textColor = color ?? OrTrackColors.white;
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.actionRowInner}>
        <Ionicons name={iconName as any} size={18} color={textColor} />
        <Text style={[styles.rowLabel, { color: textColor, flex: 1 }]}>
          {label}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={textColor} />
    </TouchableOpacity>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].charAt(0).toUpperCase();
  return (words[0].charAt(0) + words[words.length - 1].charAt(0)).toUpperCase();
}

// ─── Composant principal ──────────────────────────────────────────────────────

export default function ReglagesScreen() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [profileSaved, setProfileSaved] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const { showPaywall } = usePremium();
  const [showProfileForm, setShowProfileForm] = useState(false);

  // ── Chargement initial ────────────────────────────────────────────────────

  useEffect(() => {
    AsyncStorage.getItem(PROFILE_KEY).then((raw) => {
      if (!raw) return;
      const p = JSON.parse(raw);
      setName(p.name ?? '');
      setEmail(p.email ?? '');
    });
    AsyncStorage.getItem(SETTINGS_KEY).then((raw) => {
      if (!raw) return;
      setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(raw) });
    });
  }, []);

  useEffect(() => {
    async function loadBiometric() {
      try {
        const compatible = await LocalAuthentication.hasHardwareAsync();
        const enrolled = await LocalAuthentication.isEnrolledAsync();
        setBiometricAvailable(compatible && enrolled);
        const stored = await AsyncStorage.getItem('@ortrack:biometric_enabled');
        setBiometricEnabled(stored === 'true');
      } catch {
        setBiometricAvailable(false);
      }
    }
    loadBiometric();
  }, []);

  // ── Sauvegarde profil ─────────────────────────────────────────────────────

  const saveProfile = async () => {
    await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify({ name: name.trim(), email: email.trim() }));
    setProfileSaved(true);
    setTimeout(() => setProfileSaved(false), 2000);
  };

  // ── Mise à jour + sauvegarde instantanée des préférences ──────────────────

  const updateSettings = async (patch: Partial<AppSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    if (patch.currency && patch.currency !== settings.currency) {
      await AsyncStorage.removeItem('@ortrack:spot_cache');
      const periods = ['1M', '3M', '1A', '5A', '10A', '20A'];
      const currencies = ['EUR', 'USD', 'CHF'];
      const metals = ['gold', 'silver', 'platinum', 'palladium', 'copper'];
      const histCacheKeys = [
        // Nouveau format avec métal
        ...periods.flatMap(p =>
          currencies.flatMap(c =>
            metals.map(m => `@ortrack:history_cache_${p}_${c}_${m}`)
          )
        ),
        // Ancien format sans métal (nettoyage des clés obsolètes)
        ...periods.flatMap(p =>
          currencies.map(c => `@ortrack:history_cache_${p}_${c}`)
        ),
      ];
      await Promise.all(histCacheKeys.map(k => AsyncStorage.removeItem(k)));
    }
  };

  async function toggleBiometric(value: boolean) {
    setBiometricEnabled(value);
    await AsyncStorage.setItem(
      '@ortrack:biometric_enabled',
      value ? 'true' : 'false'
    );
  }

  // ── Export portefeuille ───────────────────────────────────────────────────

  const exportPortfolio = async () => {
    const raw = await AsyncStorage.getItem(POSITIONS_KEY);
    const positions = raw ? JSON.parse(raw) : [];
    const json = JSON.stringify({ exportedAt: new Date().toISOString(), positions }, null, 2);
    await Share.share({ message: json, title: 'OrTrack — Portefeuille' });
  };

  const exportCSV = async () => {
    const raw = await AsyncStorage.getItem(POSITIONS_KEY);
    const positions = raw ? JSON.parse(raw) : [];
    if (positions.length === 0) {
      Alert.alert('Aucune donnée', 'Votre portefeuille est vide.');
      return;
    }
    const header = 'Métal,Produit,Quantité,Poids unitaire (g),Prix achat unitaire,Date achat';
    const rows = positions.map((p: any) =>
      [
        p.metal,
        `"${p.product}"`,
        p.quantity,
        p.weightG,
        p.purchasePrice,
        p.purchaseDate,
      ].join(',')
    );
    const csv = [header, ...rows].join('\n');
    await Share.share({
      message: csv,
      title: 'OrTrack — Portefeuille.csv',
    });
  };

  // ── Sauvegarde complète ───────────────────────────────────────────────────

  const exportAllData = async () => {
    const [rawPositions, rawProfile, rawSettings] = await Promise.all([
      AsyncStorage.getItem(POSITIONS_KEY),
      AsyncStorage.getItem(PROFILE_KEY),
      AsyncStorage.getItem(SETTINGS_KEY),
    ]);
    const backup = {
      exportedAt: new Date().toISOString(),
      version: '1.0.0',
      positions: rawPositions ? JSON.parse(rawPositions) : [],
      profil: rawProfile ? JSON.parse(rawProfile) : {},
      settings: rawSettings ? JSON.parse(rawSettings) : DEFAULT_SETTINGS,
    };
    await Share.share({
      message: JSON.stringify(backup, null, 2),
      title: 'OrTrack — Sauvegarde complète',
    });
  };

  // ── Suppression totale ────────────────────────────────────────────────────

  const deleteAllData = () => {
    Alert.alert(
      'Supprimer toutes les données',
      'Cette action effacera définitivement toutes vos positions, votre profil et vos préférences. Cette opération est irréversible.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Tout supprimer',
          style: 'destructive',
          onPress: async () => {
            await AsyncStorage.multiRemove([POSITIONS_KEY, PROFILE_KEY, SETTINGS_KEY]);
            setName('');
            setEmail('');
            setSettings(DEFAULT_SETTINGS);
            Alert.alert('Données supprimées', 'Toutes vos données ont été effacées.');
          },
        },
      ]
    );
  };

  // ─────────────────────────────────────────────────────────────────────────

  const initials = getInitials(name);

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>

          {/* En-tête */}
          <View style={styles.header}>
            <Text style={styles.headerBrand}>ORTRACK</Text>
            <Text style={styles.headerTab}>Réglages</Text>
          </View>

          {/* ── PREMIUM ─────────────────────────────────────────────── */}
          <TouchableOpacity
            style={styles.premiumCard}
            onPress={showPaywall}
            activeOpacity={0.8}
          >
            <View style={styles.premiumLeft}>
              <Svg width={32} height={32} viewBox="0 0 24 24" fill="none">
                <Path
                  d="M2 8l4 12h12l4-12-5 4-5-8-5 8-5-4z"
                  fill={OrTrackColors.gold}
                  opacity={0.9}
                />
                <Path
                  d="M6 20h12v2H6z"
                  fill={OrTrackColors.gold}
                  opacity={0.7}
                />
              </Svg>
              <View>
                <Text style={styles.premiumTitle}>OrTrack Premium</Text>
                <Text style={styles.premiumStatus}>Découvrir les avantages</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color={OrTrackColors.gold} />
          </TouchableOpacity>

          {/* ── PROFIL ──────────────────────────────────────────────── */}
          <SectionTitle title="Profil" />
          <View style={styles.card}>
            <TouchableOpacity
              style={styles.profileRow}
              onPress={() => setShowProfileForm(!showProfileForm)}
              activeOpacity={0.7}
            >
              <View style={styles.profileLeft}>
                <View style={styles.avatarSmall}>
                  <Text style={styles.avatarSmallText}>{initials}</Text>
                </View>
                <View>
                  <Text style={styles.profileName}>
                    {name || 'Ajouter votre nom'}
                  </Text>
                  <Text style={styles.profileEmail}>
                    {email || 'Ajouter votre email'}
                  </Text>
                </View>
              </View>
              <Ionicons
                name={showProfileForm ? 'chevron-up' : 'chevron-down'}
                size={16}
                color={OrTrackColors.subtext}
              />
            </TouchableOpacity>

            {showProfileForm && (
              <>
                <ItemSeparator />
                <View style={styles.fieldRow}>
                  <Text style={styles.fieldLabel}>Nom</Text>
                  <TextInput
                    style={styles.fieldInput}
                    value={name}
                    onChangeText={setName}
                    placeholder="Votre nom"
                    placeholderTextColor={OrTrackColors.tabIconDefault}
                    returnKeyType="next"
                  />
                </View>
                <ItemSeparator />
                <View style={styles.fieldRow}>
                  <Text style={styles.fieldLabel}>Email</Text>
                  <TextInput
                    style={styles.fieldInput}
                    value={email}
                    onChangeText={setEmail}
                    placeholder="votre@email.com"
                    placeholderTextColor={OrTrackColors.tabIconDefault}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    returnKeyType="done"
                  />
                </View>
                <ItemSeparator />
                <TouchableOpacity
                  onPress={saveProfile}
                  style={[styles.saveButton, profileSaved && styles.saveButtonConfirmed]}
                  activeOpacity={0.8}>
                  <Text style={[
                    styles.saveButtonText,
                    { color: profileSaved ? OrTrackColors.background : OrTrackColors.gold }
                  ]}>
                    {profileSaved ? '✓  Enregistré' : 'Enregistrer'}
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </View>

          {/* ── PRÉFÉRENCES ────────────────────────────────────────────── */}
          <SectionTitle title="Préférences" />
          <View style={styles.card}>

            <SegmentRow
              label="Devise d'affichage"
              options={[
                { label: 'EUR', value: 'EUR' as Currency },
                { label: 'USD', value: 'USD' as Currency },
                { label: 'CHF', value: 'CHF' as Currency },
              ]}
              value={settings.currency}
              onChange={async (v) => {
                await updateSettings({ currency: v });
                router.replace('/(tabs)/' as any);
              }}
            />

            <ItemSeparator />

            <ToggleRow
              label="Rafraîchissement auto"
              sublabel="Mise à jour des cours en arrière-plan"
              value={settings.autoRefresh}
              onChange={(v) => updateSettings({ autoRefresh: v })}
            />

            {settings.autoRefresh && (
              <>
                <ItemSeparator />
                <SegmentRow
                  label="Intervalle"
                  options={[
                    { label: '5 min', value: 5 as RefreshInterval },
                    { label: '15 min', value: 15 as RefreshInterval },
                    { label: '30 min', value: 30 as RefreshInterval },
                  ]}
                  value={settings.refreshInterval}
                  onChange={(v) => updateSettings({ refreshInterval: v })}
                />
              </>
            )}
          </View>

          {/* ── NOTIFICATIONS ──────────────────────────────────────────── */}
          <SectionTitle title="Notifications" />
          <View style={styles.card}>

            <ToggleRow
              label="Alertes de cours"
              sublabel="Variations importantes de l'or et de l'argent"
              value={settings.notifPriceAlert}
              onChange={(v) => updateSettings({ notifPriceAlert: v })}
            />

            <ItemSeparator />

            <ToggleRow
              label="Variation journalière"
              sublabel="Récap quotidien de votre portefeuille"
              value={settings.notifDailyVariation}
              onChange={(v) => updateSettings({ notifDailyVariation: v })}
            />

            <ItemSeparator />

            <ToggleRow
              label="Bilan hebdomadaire"
              sublabel="Résumé de la semaine chaque dimanche"
              value={settings.notifWeeklyReport}
              onChange={(v) => updateSettings({ notifWeeklyReport: v })}
            />

            <ItemSeparator />

            <TouchableOpacity
              style={styles.alertsLink}
              onPress={() => router.push('/alertes')}>
              <View>
                <Text style={styles.alertsLinkLabel}>Gérer mes alertes de cours</Text>
                <Text style={styles.alertsLinkSub}>Seuils personnalisés Or &amp; Argent</Text>
              </View>
              <Text style={styles.alertsLinkArrow}>›</Text>
            </TouchableOpacity>
          </View>

          {/* ── DONNÉES ────────────────────────────────────────────────── */}
          <SectionTitle title="Données" />
          <View style={styles.card}>

            <ActionRow
              label="Exporter mon portefeuille (JSON)"
              iconName="share-outline"
              onPress={exportPortfolio}
            />

            <ItemSeparator />

            <ActionRow
              label="Exporter en CSV"
              iconName="document-text-outline"
              onPress={exportCSV}
            />

            <ItemSeparator />

            <ActionRow
              label="Sauvegarder mes données"
              iconName="save-outline"
              onPress={exportAllData}
            />

            <ItemSeparator />

            <ActionRow
              label="Supprimer toutes mes données"
              iconName="trash-outline"
              color="#E07070"
              onPress={deleteAllData}
            />
          </View>

          {/* ── À PROPOS ───────────────────────────────────────────────── */}
          <SectionTitle title="À propos" />
          <View style={styles.card}>

            <InfoRow label="Version" value="1.0.0" />

            <ItemSeparator />

            <InfoRow label="Application" value="OrTrack" />

            <ItemSeparator />

            <TouchableOpacity
              style={styles.row}
              activeOpacity={0.7}
              onPress={() =>
                Alert.alert(
                  'Mentions légales',
                  'OrTrack est une application de suivi de métaux précieux à usage personnel. Les cours affichés sont fournis à titre indicatif et ne constituent pas un conseil en investissement. L\'application ne collecte aucune donnée personnelle sur des serveurs externes.'
                )
              }>
              <Text style={styles.rowLabel}>Mentions légales</Text>
              <Text style={styles.chevron}>›</Text>
            </TouchableOpacity>

            <ItemSeparator />

            <TouchableOpacity
              style={styles.row}
              activeOpacity={0.7}
              onPress={() =>
                Alert.alert(
                  'Politique de confidentialité',
                  'OrTrack stocke vos données uniquement sur votre appareil via AsyncStorage. Aucune donnée n\'est transmise à des tiers. Les cours financiers sont récupérés depuis des APIs publiques sans identification. Vous pouvez supprimer toutes vos données depuis la section Données.'
                )
              }>
              <Text style={styles.rowLabel}>Politique de confidentialité</Text>
              <Text style={styles.chevron}>›</Text>
            </TouchableOpacity>

            <ItemSeparator />
            <TouchableOpacity
              style={styles.row}
              activeOpacity={0.7}
              onPress={async () => {
                await AsyncStorage.removeItem('@ortrack:onboarding_complete');
                setTimeout(() => router.replace('/onboarding'), 0);
              }}>
              <View style={styles.actionRowInner}>
                <Ionicons
                  name="information-circle-outline"
                  size={18}
                  color={OrTrackColors.subtext}
                />
                <Text style={[styles.rowLabel, { color: OrTrackColors.subtext }]}>
                  Tutoriel de démarrage
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={OrTrackColors.subtext} />
            </TouchableOpacity>
          </View>

          {/* ── SÉCURITÉ ────────────────────────────────────────── */}
          {biometricAvailable && (
            <>
              <SectionTitle title="Sécurité" />
              <View style={styles.card}>
                <View style={styles.settingRow}>
                  <View style={styles.settingInfo}>
                    <Ionicons
                      name="finger-print-outline"
                      size={20}
                      color={OrTrackColors.gold}
                    />
                    <Text style={styles.settingLabel}>
                      Verrouillage biométrique
                    </Text>
                  </View>
                  <Switch
                    value={biometricEnabled}
                    onValueChange={toggleBiometric}
                    trackColor={{
                      false: OrTrackColors.border,
                      true: 'rgba(201,168,76,0.4)',
                    }}
                    thumbColor={
                      biometricEnabled
                        ? OrTrackColors.gold
                        : '#888888'
                    }
                  />
                </View>
              </View>
            </>
          )}

          <Text style={styles.footer}>OrTrack v1.0.0 · Suivi de métaux précieux</Text>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: OrTrackColors.background,
  },
  flex: { flex: 1 },
  scrollContent: {
    padding: 20,
    paddingBottom: 48,
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  headerBrand: {
    fontSize: 13,
    color: OrTrackColors.gold,
    fontWeight: '700',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  headerTab: {
    fontSize: 13,
    color: OrTrackColors.subtext,
  },

  // Section title
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: OrTrackColors.gold,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 8,
    marginTop: 8,
    paddingHorizontal: 4,
  },

  // Card container
  card: {
    backgroundColor: OrTrackColors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: OrTrackColors.border,
    overflow: 'hidden',
    marginBottom: 24,
  },

  // Separator
  separator: {
    height: 1,
    backgroundColor: OrTrackColors.border,
    marginLeft: 16,
  },

  // Generic row
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 52,
  },
  rowLeft: {
    flex: 1,
    marginRight: 12,
  },
  rowLabel: {
    fontSize: 15,
    color: OrTrackColors.white,
    flex: 1,
  },
  rowSub: {
    fontSize: 12,
    color: OrTrackColors.subtext,
    marginTop: 2,
  },
  rowValue: {
    fontSize: 14,
    color: OrTrackColors.subtext,
  },
  chevron: {
    fontSize: 20,
    color: OrTrackColors.tabIconDefault,
    fontWeight: '300',
    lineHeight: 22,
  },

  // Action row inner
  actionRowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },

  // Premium card
  premiumCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: OrTrackColors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(201,168,76,0.3)',
    padding: 16,
    marginBottom: 24,
  },
  premiumLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  premiumTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: OrTrackColors.gold,
  },
  premiumStatus: {
    fontSize: 12,
    color: OrTrackColors.subtext,
    marginTop: 2,
  },

  // Profile
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  profileLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatarSmall: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1F1B0A',
    borderWidth: 1.5,
    borderColor: OrTrackColors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarSmallText: {
    fontSize: 14,
    fontWeight: '700',
    color: OrTrackColors.gold,
  },
  profileName: {
    fontSize: 14,
    fontWeight: '600',
    color: OrTrackColors.white,
  },
  profileEmail: {
    fontSize: 12,
    color: OrTrackColors.subtext,
    marginTop: 1,
  },

  // Field rows (profile inputs)
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 4,
    minHeight: 52,
    gap: 12,
  },
  fieldLabel: {
    fontSize: 15,
    color: OrTrackColors.subtext,
    width: 52,
  },
  fieldInput: {
    flex: 1,
    fontSize: 15,
    color: OrTrackColors.white,
    paddingVertical: 10,
  },

  // Save profile button
  saveButton: {
    margin: 12,
    backgroundColor: 'transparent',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: OrTrackColors.gold,
    paddingVertical: 12,
    alignItems: 'center',
  },
  saveButtonConfirmed: {
    backgroundColor: '#2E7D32',
  },
  saveButtonText: {
    fontSize: 14,
    fontWeight: '700',
  },

  // Segmented control row
  segmentRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  segmentGroup: {
    flexDirection: 'row',
    marginTop: 10,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: OrTrackColors.border,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
    backgroundColor: OrTrackColors.background,
    borderRightWidth: 1,
    borderRightColor: OrTrackColors.border,
  },
  segmentBtnActive: {
    backgroundColor: OrTrackColors.gold,
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '600',
    color: OrTrackColors.subtext,
  },
  segmentTextActive: {
    color: OrTrackColors.background,
  },

  // Footer
  footer: {
    fontSize: 11,
    color: OrTrackColors.tabIconDefault,
    textAlign: 'center',
    marginTop: 4,
    paddingBottom: 8,
  },

  // Biometric setting row
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 20,
    backgroundColor: OrTrackColors.card,
    borderRadius: 12,
    marginBottom: 0,
  },
  settingInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 12,
  },
  settingLabel: {
    fontSize: 15,
    color: OrTrackColors.white,
  },

  // Lien alertes
  alertsLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  alertsLinkLabel: {
    fontSize: 15,
    color: OrTrackColors.white,
    fontWeight: '500',
    marginBottom: 2,
  },
  alertsLinkSub: {
    fontSize: 12,
    color: OrTrackColors.subtext,
  },
  alertsLinkArrow: {
    fontSize: 22,
    color: OrTrackColors.gold,
    fontWeight: '300',
    lineHeight: 24,
  },
});
