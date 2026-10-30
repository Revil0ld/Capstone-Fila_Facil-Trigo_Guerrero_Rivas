import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { updateCustomerPresence } from '@/data/customer-presence';
import { useTheme } from '@/hooks/use-theme';
import { CUSTOMER_PRESENCE_TASK } from '@/tasks/customer-presence-task';

export function CustomerPresenceSetting() {
  const theme = useTheme();
  const [isTracking, setIsTracking] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (Platform.OS === 'web') {
      return;
    }

    let isMounted = true;
    Location.hasStartedLocationUpdatesAsync(CUSTOMER_PRESENCE_TASK)
      .then((started) => {
        if (isMounted) {
          setIsTracking(started);
        }
      })
      .catch((error: unknown) => {
        console.error('No se pudo consultar el estado del aforo automático.', error);
        if (isMounted) {
          setMessage('No se pudo comprobar si el aforo automático está activo.');
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  async function enableTracking() {
    setIsBusy(true);
    setMessage(null);
    try {
      const foregroundPermission = await Location.requestForegroundPermissionsAsync();
      if (foregroundPermission.status !== 'granted') {
        setMessage('Para activarlo, permite el acceso a tu ubicación.');
        return;
      }

      const backgroundPermission = await Location.requestBackgroundPermissionsAsync();
      if (backgroundPermission.status !== 'granted') {
        setMessage(
          'No se concedió ubicación en segundo plano. Puedes habilitarla en los ajustes del dispositivo.'
        );
        return;
      }

      await Location.startLocationUpdatesAsync(CUSTOMER_PRESENCE_TASK, {
        accuracy: Location.Accuracy.Balanced,
        timeInterval: 60_000,
        distanceInterval: 25,
        foregroundService: {
          notificationTitle: 'Fila Fácil está actualizando el aforo',
          notificationBody: 'Contamos tu presencia solo mientras estés cerca de un supermercado.',
        },
      });
      setIsTracking(true);

      try {
        const location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        await updateCustomerPresence(location);
      } catch (error) {
        console.error('No se pudo registrar tu ubicación inicial para el aforo.', error);
        setMessage('El seguimiento está activo, pero no se pudo registrar tu ubicación aún.');
      }
    } catch (error) {
      console.error('No se pudo activar el aforo automático.', error);
      setMessage(
        error instanceof Error
          ? `No se pudo activar el aforo automático. ${error.message}`
          : 'No se pudo activar el aforo automático.'
      );
    } finally {
      setIsBusy(false);
    }
  }

  async function disableTracking() {
    setIsBusy(true);
    setMessage(null);
    try {
      if (await Location.hasStartedLocationUpdatesAsync(CUSTOMER_PRESENCE_TASK)) {
        await Location.stopLocationUpdatesAsync(CUSTOMER_PRESENCE_TASK);
      }
      setIsTracking(false);
      await updateCustomerPresence(null);
    } catch (error) {
      console.error('No se pudo desactivar correctamente el aforo automático.', error);
      setMessage(
        error instanceof Error
          ? `No se pudo desactivar correctamente el aforo automático. ${error.message}`
          : 'No se pudo desactivar correctamente el aforo automático.'
      );
    } finally {
      setIsBusy(false);
    }
  }

  function handleToggle() {
    if (Platform.OS === 'web') {
      setMessage('El seguimiento de ubicación está disponible en la aplicación móvil.');
      return;
    }

    if (isTracking) {
      void disableTracking();
      return;
    }

    Alert.alert(
      'Activar aforo automático',
      'Fila Fácil usará tu ubicación para contarte como cliente si estás a 100 m o menos de un supermercado. El seguimiento continuará en segundo plano hasta que lo desactives.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Continuar', onPress: () => void enableTracking() },
      ]
    );
  }

  if (Platform.OS === 'web') {
    return (
      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="subtitle" style={styles.sectionTitle}>
          Aforo automático
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          El seguimiento de ubicación en segundo plano está disponible en la aplicación móvil, no
          en la versión web.
        </ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="subtitle" style={styles.sectionTitle}>
        Aforo automático
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        Permite contar tu presencia al estar cerca de un supermercado. Puedes desactivarlo cuando
        quieras.
      </ThemedText>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: isBusy, selected: isTracking }}
        disabled={isBusy}
        onPress={handleToggle}
        style={({ pressed }) => [
          styles.button,
          { backgroundColor: isTracking ? '#20805A' : theme.primary },
          pressed && styles.pressed,
          isBusy && styles.disabled,
        ]}
      >
        {isBusy ? (
          <ActivityIndicator color={theme.primaryForeground} />
        ) : (
          <ThemedText type="smallBold" themeColor="primaryForeground">
            {isTracking ? 'Desactivar aforo automático' : 'Activar aforo automático'}
          </ThemedText>
        )}
      </Pressable>
      {message ? (
        <ThemedText type="small" style={{ color: theme.danger }}>
          {message}
        </ThemedText>
      ) : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: Spacing.three,
    gap: Spacing.two,
    borderRadius: Spacing.three,
  },
  sectionTitle: {
    fontSize: 20,
    lineHeight: 28,
  },
  button: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
  },
  pressed: {
    opacity: 0.8,
  },
  disabled: {
    opacity: 0.7,
  },
});
