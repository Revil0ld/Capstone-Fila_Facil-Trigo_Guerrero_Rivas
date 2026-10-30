import { router } from 'expo-router';
import * as Location from 'expo-location';
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

type FormState = {
  fullName: string;
  email: string;
  phone: string;
  region: string;
  comuna: string;
  calle: string;
  password: string;
  confirmPassword: string;
};

const initialState: FormState = {
  fullName: '',
  email: '',
  phone: '',
  region: '',
  comuna: '',
  calle: '',
  password: '',
  confirmPassword: '',
};

export default function RegisterPage() {
  const theme = useTheme();
  const { signUp, isLoading } = useSession();
  const [form, setForm] = useState<FormState>(initialState);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function updateForm(field: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setError(null);
    setSuccess(null);
  }

  async function handleSubmit() {
    if (isLoading || isSubmitting) return;

    const { fullName, email, phone, region, comuna, calle, password, confirmPassword } = form;

    if (
      !fullName.trim() ||
      !email.trim() ||
      !phone.trim() ||
      !region.trim() ||
      !comuna.trim() ||
      !calle.trim() ||
      !password ||
      !confirmPassword
    ) {
      setError('Completa todos los campos para continuar.');
      return;
    }

    if (
      password.length < 6 ||
      !/[A-Z]/.test(password) ||
      !/[0-9]/.test(password) ||
      !/[!@#$%^&*(),.?":{}|<>+]/.test(password)
    ) {
      setError(
        'La contraseña debe tener al menos 6 caracteres, una letra mayúscula, un número y un carácter especial.'
      );
      return;
    }

    if (!/^\d{9}$/.test(phone.trim())) {
      setError('El número de teléfono debe tener 9 dígitos.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        throw new Error(
          'Necesitamos permiso de ubicación para guardar tu ubicación inicial. Puedes habilitarlo en los ajustes del dispositivo.'
        );
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const { requiresEmailConfirmation } = await signUp(email, password, {
        fullName,
        phone,
        region,
        comuna,
        calle,
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });
      if (requiresEmailConfirmation) {
        setSuccess('Cuenta creada. Revisa tu correo electrónico para confirmar el registro.');
      } else {
        router.replace('/map');
      }
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : 'No se pudo crear la cuenta.'
      );
    } finally {
      setIsSubmitting(false);
    }
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
                  Crear cuenta
                </ThemedText>
                <ThemedText style={styles.subtitle} themeColor="textSecondary">
                  Regístrate para comenzar a usar Fila Fácil. Guardaremos tu dirección y ubicación
                  inicial.
                </ThemedText>
              </View>

              <View style={styles.form}>
                <TextField
                  label="Nombre completo"
                  placeholder="Juan Pérez"
                  value={form.fullName}
                  onChangeText={(value) => updateForm('fullName', value)}
                  autoComplete="name"
                  textContentType="name"
                  returnKeyType="next"
                />

                <TextField
                  label="Correo electrónico"
                  placeholder="correo@ejemplo.com"
                  value={form.email}
                  onChangeText={(value) => updateForm('email', value)}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                  textContentType="emailAddress"
                  returnKeyType="next"
                />

                <TextField
                  label="Teléfono"
                  placeholder="9 XXXX XXXX"
                  value={form.phone}
                  onChangeText={(value) => updateForm('phone', value)}
                  keyboardType="phone-pad"
                  autoComplete="tel"
                  textContentType="telephoneNumber"
                  returnKeyType="next"
                />

                <TextField
                  label="Región"
                  placeholder="Región"
                  value={form.region}
                  onChangeText={(value) => updateForm('region', value)}
                  returnKeyType="next"
                />

                <TextField
                  label="Comuna"
                  placeholder="Comuna"
                  value={form.comuna}
                  onChangeText={(value) => updateForm('comuna', value)}
                  returnKeyType="next"
                />

                <TextField
                  label="Calle y número"
                  placeholder="Av. Ejemplo 123"
                  value={form.calle}
                  onChangeText={(value) => updateForm('calle', value)}
                  autoComplete="street-address"
                  returnKeyType="next"
                />

                <TextField
                  label="Contraseña"
                  placeholder="Crea una contraseña"
                  value={form.password}
                  onChangeText={(value) => updateForm('password', value)}
                  secureTextEntry
                  autoCapitalize="none"
                  autoComplete="new-password"
                  textContentType="newPassword"
                  returnKeyType="next"
                />

                <TextField
                  label="Confirmar contraseña"
                  placeholder="Repite tu contraseña"
                  value={form.confirmPassword}
                  onChangeText={(value) => updateForm('confirmPassword', value)}
                  secureTextEntry
                  autoCapitalize="none"
                  autoComplete="new-password"
                  textContentType="newPassword"
                  returnKeyType="done"
                  onSubmitEditing={handleSubmit}
                />

                {error ? (
                  <ThemedView type="backgroundElement" style={styles.messageBanner}>
                    <ThemedText type="small" style={{ color: theme.danger }}>
                      {error}
                    </ThemedText>
                  </ThemedView>
                ) : null}

                {success ? (
                  <ThemedView type="backgroundElement" style={styles.messageBanner}>
                    <ThemedText type="small" style={{ color: theme.primary }}>
                      {success}
                    </ThemedText>
                  </ThemedView>
                ) : null}

                <Pressable
                  accessibilityRole="button"
                  disabled={isLoading || isSubmitting}
                  onPress={handleSubmit}
                  style={({ pressed }) => [
                    styles.button,
                    { backgroundColor: theme.primary },
                    pressed && styles.pressed,
                    (isLoading || isSubmitting) && styles.disabled,
                  ]}>
                  {isLoading || isSubmitting ? (
                    <ActivityIndicator color={theme.primaryForeground} />
                  ) : (
                    <ThemedText style={[styles.buttonLabel, { color: theme.primaryForeground }]}>
                      Registrarme
                    </ThemedText>
                  )}
                </Pressable>
              </View>

              <View style={styles.footer}>
                <ThemedText type="small" themeColor="textSecondary">
                  ¿Ya tienes cuenta?{' '}
                </ThemedText>
                <Pressable
                  accessibilityRole="button"
                  disabled={isLoading || isSubmitting}
                  onPress={() => router.replace('/login')}
                  hitSlop={Spacing.two}>
                  <ThemedText type="smallBold" style={{ color: theme.primary }}>
                    Iniciar sesión
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
