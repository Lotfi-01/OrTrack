import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as LocalAuthentication from 'expo-local-authentication';
import { SafeAreaView } from 'react-native-safe-area-context';

import { OrTrackColors } from '@/constants/theme';
import { STORAGE_KEYS, WIPE_STORAGE_KEYS } from '@/constants/storage-keys';
import { resetPositionsCache, awaitPendingPositionWrites } from '@/hooks/use-positions';
import { Position } from '@/types/position';
import { reportError } from '@/utils/error-reporting';
import { deleteAuthenticatedUserServerData } from '@/services/auth-session';

// ─── Clés AsyncStorage ────────────────────────────────────────────────────────


// RFC 4180 — échappe les virgules, guillemets et retours à la ligne
function csvEscape(value: unknown): string {
  const str = String(value ?? '');
  return `"${str.replace(/"/g, '""')}"`;
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Currency = 'EUR' | 'USD' | 'CHF';

type AppSettings = {
  currency: Currency;
  notifPriceAlert: boolean;
  notifDailyVariation: boolean;
  notifWeeklyReport: boolean;
};

const DEFAULT_SETTINGS: AppSettings = {
  currency: 'EUR',
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

// ─── Composant principal ──────────────────────────────────────────────────────

export default function ReglagesScreen() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);

  // ── Chargement initial ────────────────────────────────────────────────────

  useEffect(() => {
    let mounted = true;

    async function loadSettings() {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEYS.settings);
        if (!raw || !mounted) return;
        try {
          setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(raw) });
        } catch (error) {
          reportError(error, { scope: 'settings', action: 'parse_settings' });
          AsyncStorage.removeItem(STORAGE_KEYS.settings).catch(removeError => {
            reportError(removeError, { scope: 'settings', action: 'remove_invalid_settings' });
          });
        }
      } catch (error) {
        reportError(error, { scope: 'settings', action: 'load_settings' });
      }
    }

    loadSettings();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    async function loadBiometric() {
      try {
        const compatible = await LocalAuthentication.hasHardwareAsync();
        const enrolled = await LocalAuthentication.isEnrolledAsync();
        setBiometricAvailable(compatible && enrolled);
        const stored = await AsyncStorage.getItem(STORAGE_KEYS.biometricEnabled);
        setBiometricEnabled(stored === 'true');
      } catch (error) {
        reportError(error, { scope: 'settings', action: 'load_biometric_settings' });
        setBiometricAvailable(false);
      }
    }
    loadBiometric();
  }, []);

  // ── Mise à jour + sauvegarde instantanée des préférences ──────────────────

  const updateSettings = async (patch: Partial<AppSettings>): Promise<boolean> => {
    const previous = settings;
    const next = { ...settings, ...patch };
    setSettings(next);
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(next));
      if (patch.currency && patch.currency !== settings.currency) {
        await AsyncStorage.removeItem(STORAGE_KEYS.spotCache);
        const periods = ['1M', '3M', '1A', '5A', '10A', '20A'];
        const currencies = ['EUR', 'USD', 'CHF'];
        const metals = ['gold', 'silver', 'platinum', 'palladium'];
        const histCacheKeys = [
          // Nouveau format avec métal
          ...periods.flatMap(p =>
            currencies.flatMap(c =>
              metals.map(m => `${STORAGE_KEYS.historyCachePrefix}${p}_${c}_${m}`)
            )
          ),
          // Ancien format sans métal (nettoyage des clés obsolètes)
          ...periods.flatMap(p =>
            currencies.map(c => `${STORAGE_KEYS.historyCachePrefix}${p}_${c}`)
          ),
        ];
        await Promise.all(histCacheKeys.map(k => AsyncStorage.removeItem(k)));
      }
      return true;
    } catch (error) {
      setSettings(previous);
      reportError(error, { scope: 'settings', action: 'persist_settings', metadata: { patch } });
      Alert.alert('Réglages', 'Impossible d’enregistrer ce changement. Réessayez.');
      return false;
    }
  };

  async function toggleBiometric(value: boolean) {
    const previous = biometricEnabled;
    setBiometricEnabled(value);
    try {
      await AsyncStorage.setItem(
        STORAGE_KEYS.biometricEnabled,
        value ? 'true' : 'false'
      );
    } catch (error) {
      setBiometricEnabled(previous);
      reportError(error, { scope: 'settings', action: 'persist_biometric_setting' });
      Alert.alert('Sécurité', 'Impossible d’enregistrer le réglage biométrique. Réessayez.');
    }
  }

  // ── Partager le portefeuille ─────────────────────────────────────────────

  const sharePositionsAsJson = async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEYS.positions);
      if (!raw) return;
      await Share.share({ message: raw, title: 'OrTrack — Données JSON' });
    } catch (error) {
      reportError(error, { scope: 'data-export', action: 'share_positions_json' });
      Alert.alert('Export impossible', 'Impossible de partager vos données JSON. Réessayez.');
    }
  };

  const sharePositionsAsCsv = async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEYS.positions);
      if (!raw) return;
      const positions: Position[] = JSON.parse(raw);
      if (positions.length === 0) {
        Alert.alert('Aucune donnée', 'Votre portefeuille est vide.');
        return;
      }
      const header = 'metal,product,weightG,quantity,purchasePrice,purchaseDate,note';
      const rows = positions.map(p =>
        [p.metal, p.product, p.weightG, p.quantity, p.purchasePrice, p.purchaseDate, p.note ?? '']
          .map(csvEscape).join(',')
      );
      await Share.share({ message: [header, ...rows].join('\n'), title: 'OrTrack — Données CSV' });
    } catch (error) {
      reportError(error, { scope: 'data-export', action: 'share_positions_csv' });
      Alert.alert('Export impossible', 'Impossible de partager vos données CSV. Réessayez.');
    }
  };

  // ── Suppression totale ────────────────────────────────────────────────────

  // Local wipe only. Isolated so the server-aware orchestration below can call
  // it in both the happy path (skipped/success) and the user-confirmed
  // fallback path when the server purge failed.
  const runLocalWipe = async (): Promise<boolean> => {
    try {
      // 1. Drainer la queue des mutations positions en cours pour empêcher un
      //    setItem stale de réécrire après le multiRemove.
      await awaitPendingPositionWrites();

      // 2. Nettoyage local — clés fixes et caches historiques.
      const allKeys = await AsyncStorage.getAllKeys();
      const dynamicKeys = allKeys.filter(key => key.startsWith(STORAGE_KEYS.historyCachePrefix));

      await AsyncStorage.multiRemove([...WIPE_STORAGE_KEYS, ...dynamicKeys]);

      // 3. Invalider le cache mémoire et rediriger.
      resetPositionsCache();
      router.replace('/onboarding');
      return true;
    } catch (error) {
      reportError(error, { scope: 'data-wipe', action: 'wipe_local_user_data' });
      Alert.alert(
        'Suppression locale impossible',
        'Les données locales n’ont pas été supprimées complètement. Réessayez avant de désinstaller ou de réinitialiser l’app.'
      );
      return false;
    }
  };

  // Sprint 3B-1 defensive orchestration.
  //
  // - No Supabase session available ⇒ server purge is skipped (outcome
  //   'skipped'). The local wipe runs exactly as before. The confirmation
  //   wording above is accurate in this branch: only local data is touched.
  // - Supabase session available AND RPC succeeded ⇒ server-side rows owned
  //   by auth.uid() have been deleted and the session has been signed out.
  //   Local wipe runs next.
  // - Supabase session available AND RPC failed ⇒ do NOT proceed to local
  //   wipe automatically. Present an honest choice: retry, proceed with
  //   local-only wipe (explicitly flagged as leaving server data in place),
  //   or cancel. Never claim server data was removed when it was not.
  //
  // Legacy rows with owner_id IS NULL are not removed by the RPC by design;
  // this is an accepted Sprint 3B-1 limitation covered by the product wording
  // in the user-facing confirmation steps above.
  const wipeAllUserData = async () => {
    const outcome = await deleteAuthenticatedUserServerData();

    if (outcome === 'failed') {
      Alert.alert(
        'Suppression serveur impossible',
        'Vos données serveur (alertes, tokens de notification, installations) n’ont pas pu être supprimées. Vous pouvez réessayer, ou continuer en supprimant uniquement les données stockées sur cet appareil — vos données serveur resteront alors en place.',
        [
          { text: 'Annuler', style: 'cancel' },
          { text: 'Réessayer', onPress: wipeAllUserData },
          {
            text: 'Continuer localement',
            style: 'destructive',
            onPress: () => { runLocalWipe(); },
          },
        ],
      );
      return;
    }

    // outcome is 'skipped' (no session) or 'success' (server purge + signOut).
    await runLocalWipe();
  };

  const confirmWipe = () => {
    Alert.alert(
      'Supprimer mes données locales',
      'Cette action efface uniquement les données stockées sur cet appareil : portefeuille, réglages et caches. Les alertes serveur, tokens de notification et installations déjà envoyés au serveur ne sont pas supprimés dans cette version. Pensez à partager vos données avant.',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Partager', onPress: sharePositionsAsJson },
        {
          text: 'Continuer',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Supprimer les données locales ?',
              'Cette suppression locale est irréversible sur cet appareil.',
              [
                { text: 'Annuler', style: 'cancel' },
                { text: 'Supprimer localement', style: 'destructive', onPress: wipeAllUserData },
              ],
            );
          },
        },
      ],
    );
  };

  // ── Contact ─────────────────────────────────────────────────────────────

  const handleContact = useCallback(async () => {
    try {
      const supported = await Linking.canOpenURL('mailto:contact@ortrack.fr');
      if (supported) {
        await Linking.openURL('mailto:contact@ortrack.fr');
      } else {
        Alert.alert('Nous contacter', 'contact@ortrack.fr');
      }
    } catch (error) {
      reportError(error, { scope: 'settings', action: 'open_contact_mail' });
      Alert.alert('Nous contacter', 'contact@ortrack.fr');
    }
  }, []);

  // ─────────────────────────────────────────────────────────────────────────

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
          <Text style={styles.headerTitle}>Réglages</Text>

          {/* ── PREMIUM ─────────────────────────────────────────────── */}
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
                const saved = await updateSettings({ currency: v });
                if (saved) router.replace('/(tabs)/' as any);
              }}
            />

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
              onPress={() => router.navigate('/(tabs)/alertes')}>
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
              label="Partager mes données (JSON)"
              iconName="share-outline"
              onPress={sharePositionsAsJson}
            />

            <ItemSeparator />

            <ActionRow
              label="Partager mes données (CSV)"
              iconName="document-text-outline"
              onPress={sharePositionsAsCsv}
            />

            <ItemSeparator />

            <ActionRow
              label="Supprimer mes données locales"
              iconName="trash-outline"
              color="#E07070"
              onPress={confirmWipe}
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
              onPress={handleContact}
              activeOpacity={0.7}
              accessibilityLabel="Nous contacter par email"
            >
              <View style={styles.actionRowInner}>
                <Ionicons name="chatbubble-outline" size={18} color={OrTrackColors.gold} />
                <Text style={[styles.rowLabel, { flex: 1 }]}>Nous contacter</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={OrTrackColors.subtext} />
            </TouchableOpacity>

            <ItemSeparator />

            {/* TODO: Ajouter "Noter OrTrack" quand l'app sera en production
                URL: https://play.google.com/store/apps/details?id=com.ortrack.app */}

            <TouchableOpacity
              style={styles.row}
              activeOpacity={0.7}
              onPress={() =>
                Alert.alert(
                  'Mentions légales',
                  'OrTrack est une application de suivi de métaux précieux à usage personnel. Les cours affichés sont fournis à titre indicatif et ne constituent pas un conseil en investissement. L\'application ne collecte pas votre nom, votre email ni de compte utilisateur.'
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
                  'Votre portefeuille et vos préférences sont stockés localement sur votre appareil. Les alertes de prix et les notifications push nécessitent un échange avec nos serveurs : token de notification Expo et paramètres d\'alerte. Dans cette version, ce token sert aussi à retrouver les alertes côté serveur, mais ce n\'est pas une identité utilisateur. OrTrack ne collecte pas votre nom, votre email ni de compte utilisateur. Un identifiant technique anonyme est utilisé pour le suivi des installations.'
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
                try {
                  await AsyncStorage.removeItem(STORAGE_KEYS.onboardingComplete);
                  setTimeout(() => router.replace('/onboarding'), 0);
                } catch (error) {
                  reportError(error, { scope: 'settings', action: 'restart_onboarding' });
                  Alert.alert('Tutoriel', 'Impossible de relancer le tutoriel. Réessayez.');
                }
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
    paddingBottom: 90,
  },

  // Header
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: OrTrackColors.white,
    marginBottom: 20,
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
    marginBottom: 16,
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
    paddingVertical: 18,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  premiumLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  premiumTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: OrTrackColors.gold,
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
