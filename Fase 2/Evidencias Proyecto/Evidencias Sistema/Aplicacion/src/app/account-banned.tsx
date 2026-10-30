import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useSession } from '@/context/auth';
import { useTheme } from '@/hooks/use-theme';

export default function BannedAccountScreen() {
  const theme = useTheme();
  const { signOut } = useSession();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignOut() {
    setIsSigningOut(true);
    setError(null);
    try {
      await signOut();
    } catch (signOutError) {
      console.error('No se pudo cerrar la sesión de la cuenta bloqueada.', signOutError);
      setError(
        signOutError instanceof Error
          ? signOutError.message
          : 'No se pudo cerrar la sesión. Inténtalo nuevamente.'
      );
      setIsSigningOut(false);
    }
  }

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: theme.background }]}>
      <View style={styles.content}>
        <ThemedText type="subtitle" style={styles.title}>
          Cuenta suspendida
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.description}>
          Esta cuenta no puede acceder a Fila Fácil. Si crees que se trata de un error,
          comunícate con el equipo de soporte.
        </ThemedText>
        {error ? (
          <ThemedText type="small" themeColor="danger" accessibilityRole="alert">
            {error}
          </ThemedText>
        ) : null}
        <Pressable
          accessibilityRole="button"
          disabled={isSigningOut}
          onPress={() => void handleSignOut()}
          style={[
            styles.button,
            { backgroundColor: theme.primary },
            isSigningOut && styles.disabled,
          ]}
        >
          {isSigningOut ? (
            <ActivityIndicator color={theme.primaryForeground} />
          ) : (
            <ThemedText type="smallBold" themeColor="primaryForeground">
              Cerrar sesión
            </ThemedText>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: 'center',
    padding: Spacing.four,
  },
  content: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    alignItems: 'center',
    gap: Spacing.two,
  },
  title: {
    textAlign: 'center',
  },
  description: {
    textAlign: 'center',
  },
  button: {
    width: '100%',
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Spacing.two,
  },
  disabled: {
    opacity: 0.7,
  },
});
