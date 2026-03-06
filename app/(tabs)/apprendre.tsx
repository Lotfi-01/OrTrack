import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GoldSilverRatio } from '@/components/gold-silver-ratio';
import { MetalConverter } from '@/components/metal-converter';
import { MetalGuide } from '@/components/metal-guide';
import { OrTrackColors } from '@/constants/theme';

type Tab = 'indicateurs' | 'convertisseur' | 'guide';

const TABS: { key: Tab; label: string }[] = [
  { key: 'indicateurs', label: 'Indicateurs' },
  { key: 'convertisseur', label: 'Convertisseur' },
  { key: 'guide', label: 'Guide' },
];

export default function ApprendreScreen() {
  const [activeTab, setActiveTab] = useState<Tab>('indicateurs');

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>

        {/* 1. Header compact */}
        <View style={styles.headerRow}>
          <Text style={styles.headerBrand}>ORTRACK</Text>
          <Text style={styles.headerRight}>Apprendre</Text>
        </View>

        {/* 2. Tab bar */}
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

        {/* 3. Contenu */}
        <View>
          {activeTab === 'indicateurs' && <GoldSilverRatio />}
          {activeTab === 'convertisseur' && <MetalConverter />}
          {activeTab === 'guide' && <MetalGuide />}
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
    paddingBottom: 40,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  headerBrand: {
    fontSize: 13,
    fontWeight: '600',
    color: OrTrackColors.gold,
    letterSpacing: 2,
  },
  headerRight: {
    fontSize: 13,
    color: OrTrackColors.subtext,
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
