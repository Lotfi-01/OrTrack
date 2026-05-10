import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, Stack } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import SynthesePrivacyChoice, {
  type SynthesePrivacyMode,
} from '@/components/synthese-patrimoniale/SynthesePrivacyChoice';
import { STORAGE_KEYS } from '@/constants/storage-keys';
import { OrTrackColors } from '@/constants/theme';
import { usePremium } from '@/contexts/premium-context';
import { SpotPricesProvider, useSharedSpotPrices } from '@/contexts/spot-prices-context';
import { usePositions } from '@/hooks/use-positions';
import { computePortfolioFiscalSummary } from '@/utils/fiscal';
import {
  generateAndShareSynthesePatrimoniale,
  type SyntheseShareResult,
} from '@/utils/synthese-patrimoniale/generate';

const C = OrTrackColors;

function regimeLabelOf(
  bestRegime: 'forfaitaire' | 'plusvalues' | null | undefined,
): string | null {
  if (bestRegime === 'forfaitaire') return 'Régime forfaitaire';
  if (bestRegime === 'plusvalues') return 'Régime plus-values';
  return null;
}

export default function SynthesePatrimonialeScreen() {
  return (
    <SpotPricesProvider>
      <SynthesePatrimonialeContent />
    </SpotPricesProvider>
  );
}

function SynthesePatrimonialeContent() {
  const { isPremium, isLoading: premiumLoading, showPaywall } = usePremium();
  const { positions, loading: positionsLoading } = usePositions();
  const {
    prices,
    lastUpdated,
    currencySymbol,
    loading: spotLoading,
  } = useSharedSpotPrices();

  // ── Garde Premium défensive ────────────────────────────────────────
  const paywallShownRef = useRef(false);

  useEffect(() => {
    if (premiumLoading) return;
    if (!isPremium && !paywallShownRef.current) {
      paywallShownRef.current = true;
      showPaywall();
      router.back();
    }
  }, [premiumLoading, isPremium, showPaywall]);

  // ── Privacy default depuis AsyncStorage ───────────────────────────
  const [privacyChoice, setPrivacyChoice] = useState<SynthesePrivacyMode>('complete');
  const [privacyLoaded, setPrivacyLoaded] = useState(false);

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(STORAGE_KEYS.privacyMode)
      .then(value => {
        if (!mounted) return;
        setPrivacyChoice(value === 'true' ? 'masked' : 'complete');
        setPrivacyLoaded(true);
      })
      .catch(() => {
        if (!mounted) return;
        setPrivacyChoice('complete');
        setPrivacyLoaded(true);
      });
    return () => {
      mounted = false;
    };
  }, []);

  // ── Génération ────────────────────────────────────────────────────
  const [generating, setGenerating] = useState(false);

  const fiscalSummary = useMemo(
    () => computePortfolioFiscalSummary(positions, prices),
    [positions, prices],
  );

  const hasPositions = positions.length > 0;

  const ctaDisabled =
    premiumLoading ||
    !isPremium ||
    positionsLoading ||
    !privacyLoaded ||
    !hasPositions ||
    spotLoading ||
    generating;

  const handleGenerate = useCallback(async () => {
    if (ctaDisabled) return;
    setGenerating(true);
    try {
      const generatedAtIso = new Date().toISOString();
      const result: SyntheseShareResult = await generateAndShareSynthesePatrimoniale({
        positions,
        prices: {
          gold: prices.gold ?? null,
          silver: prices.silver ?? null,
          platinum: prices.platinum ?? null,
          palladium: prices.palladium ?? null,
          lastUpdated: lastUpdated ? lastUpdated.toISOString() : null,
          currencySymbol: currencySymbol ?? '€',
        },
        generatedAtIso,
        maskSensitiveValues: privacyChoice === 'masked',
        fiscal: {
          netVendeur: fiscalSummary?.bestNet ?? null,
          regimeLabel: regimeLabelOf(fiscalSummary?.bestRegime),
        },
      });

      if (result.status === 'shared') {
        // expo-sharing ne permet pas de distinguer succès réel et annulation
        // sur Android : on reste silencieux pour ne pas afficher un message
        // de succès trompeur après une annulation utilisateur.
        return;
      }
      if (result.status === 'unavailable') {
        Alert.alert('Partage indisponible sur cet appareil.');
        return;
      }
      switch (result.reason) {
        case 'sharing_check_failed':
          Alert.alert('Vérification du partage impossible. Réessayez plus tard.');
          return;
        case 'html_generation_failed':
          Alert.alert('Génération impossible. Vérifiez vos positions et réessayez.');
          return;
        case 'pdf_generation_failed':
          Alert.alert('Création du PDF impossible. Réessayez.');
          return;
        case 'share_failed':
        default:
          // Silencieux : couvre une éventuelle annulation utilisateur côté natif.
          return;
      }
    } finally {
      setGenerating(false);
    }
  }, [
    ctaDisabled,
    positions,
    prices,
    lastUpdated,
    currencySymbol,
    privacyChoice,
    fiscalSummary,
  ]);

  // ── Garde de rendu : ne jamais rendre l'écran à un Free ───────────
  if (premiumLoading || !isPremium) return null;

  return (
    <SafeAreaView style={st.container} edges={['bottom']}>
      <Stack.Screen
        options={{
          title: 'Synthèse patrimoniale',
          headerLeft: () => (
            <TouchableOpacity onPress={() => router.back()} style={{ paddingRight: 12 }}>
              <Text style={{ color: C.gold, fontSize: 16 }}>{'←'} Retour</Text>
            </TouchableOpacity>
          ),
        }}
      />

      <ScrollView contentContainerStyle={st.scroll} showsVerticalScrollIndicator={false}>
        <Text style={st.heroTitle}>Synthèse patrimoniale</Text>
        <Text style={st.heroSub}>
          La synthèse contient un récapitulatif daté de votre portefeuille.
        </Text>
        <Text style={st.heroFootnote}>Document indicatif.</Text>

        {!hasPositions ? (
          <View style={st.emptyCard}>
            <Text style={st.emptyText}>
              Ajoutez des positions avant de générer une synthèse.
            </Text>
            <TouchableOpacity onPress={() => router.push('/(tabs)/ajouter')}>
              <Text style={st.emptyLink}>{'Ajouter une position →'}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <Text style={st.sectionLabel}>CONFIDENTIALITÉ</Text>
            <SynthesePrivacyChoice value={privacyChoice} onChange={setPrivacyChoice} />

            {spotLoading ? (
              <Text style={st.notice}>{`Chargement des cours…`}</Text>
            ) : (
              <Text style={st.notice}>
                Certaines valeurs peuvent apparaître comme non disponibles.
              </Text>
            )}

            <Text style={st.shareHint}>
              Le partage utilisera la feuille de partage native de votre appareil.
            </Text>
          </>
        )}

        <TouchableOpacity
          style={[st.cta, ctaDisabled && st.ctaDisabled]}
          disabled={ctaDisabled}
          onPress={handleGenerate}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityState={{ disabled: ctaDisabled }}
          accessibilityLabel="Générer ma synthèse"
        >
          {generating ? (
            <View style={st.ctaLoading}>
              <ActivityIndicator color={C.background} />
              <Text style={st.ctaText}>{`Génération…`}</Text>
            </View>
          ) : (
            <Text style={st.ctaText}>Générer ma synthèse</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.back()} style={st.cancelBtn}>
          <Text style={st.cancelText}>Annuler</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  scroll: { padding: 20, paddingBottom: 40 },

  heroTitle: { fontSize: 22, fontWeight: '700', color: C.white },
  heroSub: { color: C.textDim, fontSize: 13, lineHeight: 18, marginTop: 8 },
  heroFootnote: { color: C.textMuted, fontSize: 11, fontStyle: 'italic', marginTop: 6 },

  sectionLabel: {
    color: C.textDim,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: 22,
    marginBottom: 10,
  },

  notice: { color: C.textDim, fontSize: 11, marginTop: 12, lineHeight: 16 },
  shareHint: { color: C.textMuted, fontSize: 11, marginTop: 8, lineHeight: 16 },

  emptyCard: {
    marginTop: 22,
    padding: 18,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.card,
    alignItems: 'center',
    gap: 8,
  },
  emptyText: { color: C.white, fontSize: 13, textAlign: 'center' },
  emptyLink: { color: C.gold, fontSize: 12, fontWeight: '600', marginTop: 4 },

  cta: {
    marginTop: 28,
    backgroundColor: C.gold,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  ctaDisabled: { opacity: 0.4 },
  ctaText: { color: C.background, fontSize: 14, fontWeight: '700' },
  ctaLoading: { flexDirection: 'row', alignItems: 'center', gap: 8 },

  cancelBtn: { marginTop: 12, alignItems: 'center', padding: 8 },
  cancelText: { color: C.textDim, fontSize: 13 },
});
