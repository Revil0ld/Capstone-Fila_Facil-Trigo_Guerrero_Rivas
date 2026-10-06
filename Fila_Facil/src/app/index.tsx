import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useSession } from '@/context/auth';
import { useTheme } from '@/hooks/use-theme';

export default function LoginScreen() {
  const theme = useTheme();
  const { signIn, isLoading } = useSession();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | undefined>();
  const [passwordError, setPasswordError] = useState<string | undefined>();

  function validate() {
    const nextEmailError = email.trim() ? undefined : 'Ingresa tu correo electrónico';
    const nextPasswordError = password ? undefined : 'Ingresa tu contraseña';

    setEmailError(nextEmailError);
    setPasswordError(nextPasswordError);

    return !nextEmailError && !nextPasswordError;
  }

  async function handleSubmit() {
    setError(null);
    if (isLoading) return;
    if (!validate()) return;

    try {
      await signIn(email, password);
      router.replace('/map');
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : 'No se pudo iniciar sesión'
      );
    }
  }

  async function handleregister() {

    router.replace('/register');
    
  }

  return (
    <ThemedView style={styles.screen}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <SafeAreaView style={styles.flex}>
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled">
            <View style={styles.content}>
              <View style={styles.header}>
                <Image
                  source={require('@/assets/images/logo.png')}
                  style={styles.logo}
                  resizeMode="contain"
                />
                <ThemedText type="title" style={styles.title}>
                  Fila Fácil
                </ThemedText>
                <ThemedText style={styles.subtitle} themeColor="textSecondary">
                  Inicia sesión para reservar tu turno y evitar las filas.
                </ThemedText>
              </View>

              <View style={styles.form}>
                <TextField
                  label="Correo electrónico"
                  placeholder="tucorreo@ejemplo.com"
                  value={email}
                  onChangeText={(value) => {
                    setEmail(value);
                    if (emailError) setEmailError(undefined);
                    if (error) setError(null);
                  }}
                  error={emailError}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                  textContentType="emailAddress"
                  returnKeyType="next"
                />

                <TextField
                  label="Contraseña"
                  placeholder="Ingresa tu contraseña"
                  value={password}
                  onChangeText={(value) => {
                    setPassword(value);
                    if (passwordError) setPasswordError(undefined);
                    if (error) setError(null);
                  }}
                  error={passwordError}
                  secureTextEntry
                  autoCapitalize="none"
                  autoComplete="password"
                  textContentType="password"
                  returnKeyType="done"
                  onSubmitEditing={handleSubmit}
                />

                <View style={styles.optionsRow}>
                  <Pressable
                    style={styles.remember}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: rememberMe }}
                    hitSlop={Spacing.two}
                    onPress={() => setRememberMe((value) => !value)}>
                    <View
                      style={[
                        styles.checkbox,
                        {
                          borderColor: rememberMe ? theme.primary : theme.backgroundSelected,
                          backgroundColor: rememberMe ? theme.primary : 'transparent',
                        },
                      ]}>
                      {rememberMe ? (
                        <ThemedText style={[styles.checkboxMark, { color: theme.primaryForeground }]}>
                          ✓
                        </ThemedText>
                      ) : null}
                    </View>
                    <ThemedText type="small" themeColor="textSecondary">
                      Recordarme
                    </ThemedText>
                  </Pressable>

                  <Pressable hitSlop={Spacing.two}>
                    <ThemedText type="smallBold" style={{ color: theme.primary }}>
                      ¿Olvidaste tu contraseña?
                    </ThemedText>
                  </Pressable>
                </View>

                {error ? (
                  <ThemedView type="backgroundElement" style={styles.errorBanner}>
                    <ThemedText type="small" style={{ color: theme.danger }}>
                      {error}
                    </ThemedText>
                  </ThemedView>
                ) : null}

                <Pressable
                  accessibilityRole="button"
                  disabled={isLoading}
                  onPress={handleSubmit}
                  style={({ pressed }) => [
                    styles.button,
                    { backgroundColor: theme.primary },
                    pressed && styles.pressed,
                    isLoading && styles.disabled,
                  ]}>
                  {isLoading ? (
                    <ActivityIndicator color={theme.primaryForeground} />
                  ) : (
                    <ThemedText style={[styles.buttonLabel, { color: theme.primaryForeground }]}>
                      Iniciar sesión
                    </ThemedText>
                  )}
                </Pressable>
              </View>
                    
              <View style={styles.footer}>
                <ThemedText type="small" themeColor="textSecondary">
                  ¿No tienes una cuenta?{' '}
                </ThemedText>

                <Pressable   
                  accessibilityRole="button"
                  disabled={isLoading}
                  onPress={handleregister}
                  style={({ pressed }) => [
                    pressed && styles.pressed,
                    isLoading && styles.disabled,
                  ]}>{isLoading ? (
                    <ActivityIndicator color={theme.primaryForeground} />
                  ) : (
                  <ThemedText type="smallBold" style={{ color: theme.primary }}>
                    Regístrate
                  </ThemedText>)}
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.four,
  },
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    gap: Spacing.five,
  },
  header: {
    alignItems: 'center',
    gap: Spacing.three,
  },
  logo: {
    width: 72,
    height: 72,
    borderRadius: Spacing.four,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    textAlign: 'center',
  },
  subtitle: {
    textAlign: 'center',
  },
  form: {
    gap: Spacing.three,
  },
  optionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  remember: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: Spacing.one,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxMark: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
  },
  errorBanner: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.two,
  },
  button: {
    minHeight: 52,
    borderRadius: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
  },
  buttonLabel: {
    fontSize: 16,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.85,
  },
  disabled: {
    opacity: 0.7,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
});