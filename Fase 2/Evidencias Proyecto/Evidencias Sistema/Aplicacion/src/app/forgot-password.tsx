import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
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

type Step = 'email' | 'reset';

const PASSWORD_ERROR =
  'La contraseña debe tener al menos 6 caracteres, una letra mayúscula, un número y un carácter especial.';

function isValidPassword(password: string) {
  return (
    password.length >= 6 &&
    /[A-Z]/.test(password) &&
    /[0-9]/.test(password) &&
    /[!@#$%^&*(),.?":{}|<>+]/.test(password)
  );
}

export default function ForgotPasswordScreen() {
  const theme = useTheme();
  const { requestPasswordReset, verifyPasswordReset, completePasswordReset, cancelPasswordReset } =
    useSession();

  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleSendCode() {
    if (isBusy) return;
    if (!email.trim()) {
      setError('Ingresa tu correo electrónico.');
      return;
    }

    setIsBusy(true);
    setError(null);
    setNotice(null);
    try {
      await requestPasswordReset(email);
      setStep('reset');
      setNotice('Si el correo está registrado, te enviamos un código temporal.');
    } catch (sendError) {
      setError(
        sendError instanceof Error ? sendError.message : 'No se pudo enviar el código.'
      );
    } finally {
      setIsBusy(false);
    }
  }

  async function handleResetPassword() {
    if (isBusy) return;
    if (!/^\d{6,10}$/.test(code.trim())) {
      setError('Ingresa el código numérico que recibiste por correo.');
      return;
    }
    if (!isValidPassword(password)) {
      setError(PASSWORD_ERROR);
      return;
    }
    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setIsBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (!isVerified) {
        await verifyPasswordReset(email, code);
        setIsVerified(true);
      }
      await completePasswordReset(password);
      router.replace('/');
    } catch (resetError) {
      setError(
        resetError instanceof Error
          ? resetError.message
          : 'No se pudo cambiar la contraseña.'
      );
    } finally {
      setIsBusy(false);
    }
  }

  async function handleBack() {
    if (isVerified) {
      await cancelPasswordReset().catch(() => undefined);
    }
    router.replace('/');
  }

  return (
    <ThemedView style={styles.screen}>
      <KeyboardAvoidingView style={styles.flex} behavior="padding">
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
                  Recuperar contraseña
                </ThemedText>
                <ThemedText style={styles.subtitle} themeColor="textSecondary">
                  {step === 'email'
                    ? 'Te enviaremos un código temporal a tu correo para que puedas crear una nueva contraseña.'
                    : 'Ingresa el código que recibiste y elige tu nueva contraseña.'}
                </ThemedText>
              </View>

              <View style={styles.form}>
                <TextField
                  label="Correo electrónico"
                  placeholder="tucorreo@ejemplo.com"
                  value={email}
                  onChangeText={(value) => {
                    setEmail(value);
                    setError(null);
                  }}
                  editable={step === 'email'}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                  textContentType="emailAddress"
                  returnKeyType="done"
                  onSubmitEditing={step === 'email' ? handleSendCode : undefined}
                />

                {step === 'reset' ? (
                  <>
                    <TextField
                      label="Código temporal"
                      placeholder="123456"
                      value={code}
                      onChangeText={(value) => {
                        setCode(value);
                        setError(null);
                      }}
                      editable={!isVerified}
                      keyboardType="number-pad"
                      autoComplete="one-time-code"
                      textContentType="oneTimeCode"
                      maxLength={10}
                    />
                    <TextField
                      label="Nueva contraseña"
                      placeholder="Crea una contraseña"
                      value={password}
                      onChangeText={(value) => {
                        setPassword(value);
                        setError(null);
                      }}
                      secureTextEntry
                      autoCapitalize="none"
                      autoComplete="new-password"
                      textContentType="newPassword"
                      returnKeyType="next"
                    />
                    <TextField
                      label="Confirmar contraseña"
                      placeholder="Repite tu contraseña"
                      value={confirmPassword}
                      onChangeText={(value) => {
                        setConfirmPassword(value);
                        setError(null);
                      }}
                      secureTextEntry
                      autoCapitalize="none"
                      autoComplete="new-password"
                      textContentType="newPassword"
                      returnKeyType="done"
                      onSubmitEditing={handleResetPassword}
                    />
                  </>
                ) : null}

                {error ? (
                  <ThemedView type="backgroundElement" style={styles.messageBanner}>
                    <ThemedText type="small" style={{ color: theme.danger }}>
                      {error}
                    </ThemedText>
                  </ThemedView>
                ) : null}
                {notice ? (
                  <ThemedView type="backgroundElement" style={styles.messageBanner}>
                    <ThemedText type="small" style={{ color: theme.primary }}>
                      {notice}
                    </ThemedText>
                  </ThemedView>
                ) : null}

                <Pressable
                  accessibilityRole="button"
                  disabled={isBusy}
                  onPress={step === 'email' ? handleSendCode : handleResetPassword}
                  style={({ pressed }) => [
                    styles.button,
                    { backgroundColor: theme.primary },
                    pressed && styles.pressed,
                    isBusy && styles.disabled,
                  ]}>
                  {isBusy ? (
                    <ActivityIndicator color={theme.primaryForeground} />
                  ) : (
                    <ThemedText style={[styles.buttonLabel, { color: theme.primaryForeground }]}>
                      {step === 'email' ? 'Enviar código' : 'Cambiar contraseña'}
                    </ThemedText>
                  )}
                </Pressable>

                {step === 'reset' && !isVerified ? (
                  <Pressable
                    accessibilityRole="button"
                    disabled={isBusy}
                    onPress={handleSendCode}
                    hitSlop={Spacing.two}
                    style={styles.linkButton}>
                    <ThemedText type="smallBold" style={{ color: theme.primary }}>
                      Reenviar código
                    </ThemedText>
                  </Pressable>
                ) : null}
              </View>

              <View style={styles.footer}>
                <Pressable
                  accessibilityRole="button"
                  disabled={isBusy}
                  onPress={() => void handleBack()}
                  hitSlop={Spacing.two}>
                  <ThemedText type="smallBold" style={{ color: theme.primary }}>
                    Volver a iniciar sesión
                  </ThemedText>
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
  messageBanner: {
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
  linkButton: {
    alignItems: 'center',
  },
  pressed: {
    opacity: 0.85,
  },
  disabled: {
    opacity: 0.7,
  },
  footer: {
    alignItems: 'center',
  },
});
