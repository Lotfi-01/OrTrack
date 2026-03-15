import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { OrTrackColors } from '@/constants/theme';

type Props = {
  onRetry: () => void;
};

export default function BiometricLock({ onRetry }: Props) {
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar
        barStyle="light-content"
        backgroundColor={OrTrackColors.background}
      />
      <View style={styles.content}>
        <View style={styles.iconCircle}>
          <Ionicons
            name="finger-print-outline"
            size={64}
            color={OrTrackColors.gold}
          />
        </View>
        <Text style={styles.logo}>ORTRACK</Text>
        <Text style={styles.title}>Accès sécurisé</Text>
        <Text style={styles.subtitle}>
          Authentifiez-vous pour accéder{'\n'}
          à votre portefeuille
        </Text>
        <TouchableOpacity
          style={styles.button}
          onPress={onRetry}
        >
          <Ionicons
            name="finger-print-outline"
            size={20}
            color="#000000"
          />
          <Text style={styles.buttonText}>
            Utiliser la biométrie
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: OrTrackColors.background,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  iconCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(201, 168, 76, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(201, 168, 76, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    shadowColor: '#C9A84C',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 8,
  },
  logo: {
    fontSize: 13,
    color: OrTrackColors.gold,
    fontWeight: 'bold',
    letterSpacing: 4,
    textTransform: 'uppercase',
    marginBottom: 24,
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    color: '#888888',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 48,
  },
  button: {
    backgroundColor: OrTrackColors.gold,
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    columnGap: 8,
    width: '100%',
  },
  buttonText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
