import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ActualitesPanel } from '@/components/actualites-panel';
import { IndicateursPanel } from '@/components/indicateurs-panel';
import { MetalConverter } from '@/components/metal-converter';
import { MetalGuide } from '@/components/metal-guide';
import { OrTrackColors } from '@/constants/theme';

type Tab = 'actualites' | 'guide' | 'convertisseur' | 'indicateurs';

const TABS: { key: Tab; label: string }[] = [
  { key: 'actualites', label: 'Actus' },
  { key: 'guide', label: 'Métaux' },
  { key: 'convertisseur', label: 'Convertir' },
  { key: 'indicateurs', label: 'Ratios' },
];

export default function ApprendreScreen() {
  const [activeTab, setActiveTab] = useState<Tab>('actualites');

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>

        {/* Header */}
        <Text style={styles.headerTitle}>Apprendre</Text>
        <Text style={styles.headerSubtitle}>
          Comprendre les métaux pour mieux investir.
        </Text>

        {/* Tab bar */}
        <View style={styles.tabBar}>
          {TABS.map((t) => {
            const active = activeTab === t.key;
            return (
              <TouchableOpacity
                key={t.key}
                style={[styles.tabBtn, active && styles.tabBtnActive]}
                onPress={() => setActiveTab(t.key)}>
                <Text style={[styles.tabText, active && styles.tabTextActive]}>
                  {t.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Contenu */}
        <View>
          {activeTab === 'actualites' && <ActualitesPanel />}
          {activeTab === 'guide' && <MetalGuide />}
          {activeTab === 'convertisseur' && <MetalConverter />}
          {activeTab === 'indicateurs' && <IndicateursPanel />}
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: OrTrackColors.background,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 90,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: OrTrackColors.white,
    marginBottom: 4,
  },
  headerSubtitle: {
    color: OrTrackColors.subtext,
    fontSize: 14,
    marginTop: 4,
    marginBottom: 8,
  },
  tabBar: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: OrTrackColors.border,
    alignItems: 'center',
  },
  tabBtnActive: {
    borderColor: OrTrackColors.gold,
    backgroundColor: 'rgba(201,168,76,0.12)',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: OrTrackColors.subtext,
  },
  tabTextActive: {
    color: OrTrackColors.gold,
    fontWeight: '700',
  },
});
