import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useSession } from '@/context/auth';
import { useTheme } from '@/hooks/use-theme';

export default function AccountAccessCheckScreen() {
  const theme = useTheme();
  const { accessError, isAccessLoading, refreshAccountAccess, signOut } = useSession();
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function handleSignOut() {
    setIsSigningOut(true);
    try {
      await signOut();
    } catch (error) {
      console.error('No se pudo cerrar la sesión.', error);
      setIsSigningOut(false);
    }
  }

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: theme.background }]}>
      <View style={styles.content}>
        {isAccessLoading ? <ActivityIndicator color={theme.primary} /> : null}
        <ThemedText type="subtitle" style={styles.title}>
          Verificando acceso
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.description}>
          {accessError ??
            'Estamos comprobando que tu cuenta pueda acceder a Fila Fácil.'}
        </ThemedText>
        {accessError ? (
          <>
            <Pressable
              accessibilityRole="button"
              onPress={() => void refreshAccountAccess().catch(() => undefined)}
              style={[styles.button, { backgroundColor: theme.primary }]}
            >
              <ThemedText type="smallBold" themeColor="primaryForeground">
                Reintentar
              </ThemedText>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={isSigningOut}
              onPress={() => void handleSignOut()}
              style={[styles.button, { borderColor: theme.backgroundSelected }]}
            >
              <ThemedText type="smallBold">
                {isSigningOut ? 'Cerrando sesión…' : 'Cerrar sesión'}
              </ThemedText>
            </Pressable>
          </>
        ) : null}
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
    borderWidth: 1,
    borderRadius: Spacing.two,
  },
});
