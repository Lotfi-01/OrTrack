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
import * as DocumentPicker from 'expo-document-picker';
import * as SecureStore from 'expo-secure-store';
import { SafeAreaView } from 'react-native-safe-area-context';

import { OrTrackColors } from '@/constants/theme';
import { ANALYTICS_DEVICE_SECURE_STORE_KEY, STORAGE_KEYS } from '@/constants/storage-keys';
import { runLocalDataWipe } from '@/lib/local-wipe';
import { usePositions } from '@/hooks/use-positions';
import {
  notifyAppForegrounded,
  resetAnalyticsIdentityCache,
  resetAnalyticsQueue,
} from '@/services/analytics';
import { Position } from '@/types/position';
import { reportError } from '@/utils/error-reporting';
import {
  exportPayload,
  parseImportPayload,
  serializeExportPayload,
  type ExportableSettings,
} from '@/utils/positions-io';

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
  const [analyticsConsent, setAnalyticsConsent] = useState(false);
  const { replaceAllPositions } = usePositions();

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

  // ── Lecture du consentement analytics au mount ────────────────────────────
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEYS.analyticsConsent)
      .then(v => setAnalyticsConsent(v === 'true'))
      .catch(() => setAnalyticsConsent(false));
  }, []);

  // Toggle consentement : state UI ne bascule que si l'écriture AsyncStorage
  // réussit (sinon UI ON sans persistance → tracking incohérent au mount suivant).
  const handleAnalyticsConsentChange = useCallback(async (val: boolean) => {
    try {
      await AsyncStorage.setItem(
        STORAGE_KEYS.analyticsConsent,
        val ? 'true' : 'false',
      );
      setAnalyticsConsent(val);
      if (val) void notifyAppForegrounded();
    } catch (error) {
      reportError(error, { scope: 'settings', action: 'persist_analytics_consent' });
    }
  }, []);

  // Reset de l'identifiant analytics (RGPD droit à l'oubli technique).
  // Ne touche PAS au consentement — l'utilisateur veut juste un nouvel ID.
  const handleResetAnalyticsId = useCallback(() => {
    Alert.alert(
      "Réinitialiser l'identifiant analytics ?",
      'Un nouvel identifiant anonyme sera créé.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Réinitialiser',
          style: 'destructive',
          onPress: async () => {
            await SecureStore
              .deleteItemAsync(ANALYTICS_DEVICE_SECURE_STORE_KEY)
              .catch(() => undefined);
            await AsyncStorage
              .removeItem(STORAGE_KEYS.analyticsInstallId)
              .catch(() => undefined);
            await AsyncStorage
              .removeItem(STORAGE_KEYS.analyticsLastSessionStartedAt)
              .catch(() => undefined);
            await AsyncStorage
              .removeItem(STORAGE_KEYS.analyticsSessionCount)
              .catch(() => undefined);
            resetAnalyticsIdentityCache();
            resetAnalyticsQueue();
          },
        },
      ],
    );
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
      // Le wrapper est construit depuis les positions validées, pas depuis le
      // raw AsyncStorage. Cela garantit qu'un fichier corrompu n'est jamais
      // partagé tel quel et que l'export est toujours ré-importable.
      let parsed: unknown = [];
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = [];
      }
      const positions: Position[] = Array.isArray(parsed) ? (parsed as Position[]) : [];
      const payload = exportPayload(positions, settings);
      if (payload.positions.length === 0) {
        Alert.alert('Aucune donnée', 'Votre portefeuille est vide.');
        return;
      }
      await Share.share({
        message: serializeExportPayload(payload),
        title: 'OrTrack — Données JSON',
      });
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

  // ── Import JSON (DocumentPicker) ─────────────────────────────────────────

  const applyImport = async (
    positions: Position[],
    importedSettings: ExportableSettings | undefined,
    includeSettings: boolean,
  ) => {
    try {
      await replaceAllPositions(positions);
      if (includeSettings && importedSettings) {
        await AsyncStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(importedSettings));
        setSettings(importedSettings);
      }
      Alert.alert(
        'Import terminé',
        `${positions.length} position${positions.length > 1 ? 's' : ''} importée${positions.length > 1 ? 's' : ''}.${includeSettings && importedSettings ? ' Réglages restaurés.' : ''}`,
      );
    } catch (error) {
      reportError(error, { scope: 'data-import', action: 'apply_import' });
      Alert.alert(
        'Import interrompu',
        'L’import a échoué pendant l’écriture locale. Vos données actuelles n’ont pas été modifiées si aucune étape n’a abouti ; vérifiez votre portefeuille.',
      );
    }
  };

  const handleImportData = async () => {
    let picked: DocumentPicker.DocumentPickerResult;
    try {
      picked = await DocumentPicker.getDocumentAsync({
        type: ['application/json', 'text/plain', '*/*'],
        copyToCacheDirectory: true,
        multiple: false,
      });
    } catch (error) {
      reportError(error, { scope: 'data-import', action: 'pick_document' });
      Alert.alert('Import impossible', 'Impossible d’ouvrir le sélecteur de fichier. Réessayez.');
      return;
    }

    if (picked.canceled || !picked.assets || picked.assets.length === 0) return;
    const asset = picked.assets[0];

    let raw: string;
    try {
      const response = await fetch(asset.uri);
      raw = await response.text();
    } catch (error) {
      reportError(error, { scope: 'data-import', action: 'read_file' });
      Alert.alert(
        'Fichier illisible',
        'Impossible de lire le contenu du fichier sélectionné. Vérifiez qu’il s’agit bien d’un export OrTrack au format JSON.',
      );
      return;
    }

    const parsed = parseImportPayload(raw);
    if (!parsed.ok) {
      const msg =
        parsed.error.kind === 'invalid_json'
          ? 'Le fichier n’est pas un JSON valide.'
          : parsed.error.kind === 'unrecognized_shape'
            ? 'Le fichier ne correspond pas au format d’export OrTrack (objet versionné ou tableau de positions attendu).'
            : 'Aucune position valide n’a été trouvée dans ce fichier. Import refusé.';
      Alert.alert('Import refusé', msg);
      return;
    }

    const { positions, rejected, total, settings: importedSettings } = parsed.result;
    const base = `${positions.length} position${positions.length > 1 ? 's' : ''} valide${positions.length > 1 ? 's' : ''} sur ${total}${rejected > 0 ? ` · ${rejected} rejetée${rejected > 1 ? 's' : ''}` : ''}.`;
    const warning = '\n\nCette action REMPLACE l’ensemble de votre portefeuille actuel. Pensez à partager vos données avant si vous n’avez pas déjà une copie.';

    const buttons: { text: string; style?: 'cancel' | 'destructive' | 'default'; onPress?: () => void }[] = [
      { text: 'Annuler', style: 'cancel' },
    ];

    if (importedSettings) {
      buttons.push(
        {
          text: 'Positions seulement',
          style: 'destructive',
          onPress: () => { applyImport(positions, importedSettings, false); },
        },
        {
          text: 'Positions + réglages',
          style: 'destructive',
          onPress: () => { applyImport(positions, importedSettings, true); },
        },
      );
      Alert.alert(
        'Prévisualisation de l’import',
        `${base}\n\nDes réglages sont aussi présents dans ce fichier. Voulez-vous les restaurer ?${warning}`,
        buttons,
      );
    } else {
      buttons.push({
        text: 'Remplacer mes positions',
        style: 'destructive',
        onPress: () => { applyImport(positions, undefined, false); },
      });
      Alert.alert(
        'Prévisualisation de l’import',
        `${base}${warning}`,
        buttons,
      );
    }
  };

  // ── Suppression totale ────────────────────────────────────────────────────

  const wipeAllUserData = async () => {
    try {
      // Single source of truth (lib/local-wipe.ts) — drains pending position
      // writes, clears AsyncStorage + SecureStore, and resets analytics
      // in-memory state (queue + identity cache) before redirecting.
      await runLocalDataWipe();
      router.replace('/onboarding');
    } catch (error) {
      reportError(error, { scope: 'data-wipe', action: 'wipe_local_user_data' });
      Alert.alert(
        'Suppression locale impossible',
        'Les données locales n’ont pas été supprimées complètement. Réessayez avant de désinstaller ou de réinitialiser l’app.'
      );
    }
  };

  const confirmWipe = () => {
    Alert.alert(
      'Supprimer mes données locales',
      'Cette action efface uniquement les données stockées sur cet appareil : portefeuille, réglages et caches. Les alertes enregistrées côté serveur restent en place — utilisez l’écran Alertes pour les supprimer. Pensez à partager vos données avant.',
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

          {/* ── CONFIDENTIALITÉ ────────────────────────────────────────── */}
          <SectionTitle title="Confidentialité" />
          <View style={styles.card}>
            <ToggleRow
              label="Aider à améliorer OrTrack"
              sublabel="Données d'usage anonymes. Aucune donnée financière personnelle n'est envoyée."
              value={analyticsConsent}
              onChange={handleAnalyticsConsentChange}
            />
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
              label="Importer des données (JSON)"
              iconName="download-outline"
              onPress={handleImportData}
            />

            <ItemSeparator />

            <ActionRow
              label="Réinitialiser l'identifiant analytics"
              iconName="refresh-outline"
              onPress={handleResetAnalyticsId}
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
