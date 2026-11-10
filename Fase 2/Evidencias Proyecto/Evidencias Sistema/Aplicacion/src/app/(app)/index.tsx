import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CustomerPresenceSetting } from '../../components/customer-presence-setting';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import {
  getAccountProfile,
  saveAccountProfile,
  type AccountProfile,
} from '@/data/account-profile';
import { useTheme } from '@/hooks/use-theme';
import { useSession } from '@/context/auth';

const emptyProfile: AccountProfile = {
  fullName: '',
  email: '',
  phone: '',
  region: '',
  comuna: '',
  street: '',
};

export default function AccountSettingsScreen() {
  const theme = useTheme();
  const { isAdmin } = useSession();
  const [profile, setProfile] = useState<AccountProfile>(emptyProfile);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    let isMounted = true;
    void getAccountProfile()
      .then((accountProfile) => {
        if (isMounted) {
          setProfile(accountProfile);
        }
      })
      .catch((error: unknown) => {
        console.error('No se pudo cargar el perfil de la cuenta.', error);
        if (isMounted) {
          setIsError(true);
          setMessage(
            error instanceof Error ? error.message : 'No se pudo cargar tu perfil.'
          );
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  function updateProfile(field: keyof AccountProfile, value: string) {
    setProfile((current) => ({ ...current, [field]: value }));
    setMessage(null);
  }

  async function handleSave() {
    setIsSaving(true);
    setMessage(null);
    setIsError(false);
    try {
      await saveAccountProfile(profile);
      setMessage('Tu información se guardó correctamente.');
    } catch (error) {
      console.error('No se pudo guardar el perfil de la cuenta.', error);
      setIsError(true);
      setMessage(error instanceof Error ? error.message : 'No se pudo guardar tu perfil.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.content}>
          <View style={styles.header}>
            <ThemedText type="subtitle">Mi cuenta</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Administra tu perfil y las preferencias de tu cuenta.
            </ThemedText>
          </View>

          <ThemedView type="backgroundElement" style={styles.profileCard}>
            <ThemedText type="subtitle" style={styles.sectionTitle}>
              Información personal
            </ThemedText>

            {isLoading ? (
              <View style={styles.loading}>
                <ActivityIndicator color={theme.primary} />
                <ThemedText type="small" themeColor="textSecondary">
                  Cargando tu perfil…
                </ThemedText>
              </View>
            ) : (
              <>
                <ProfileField
                  label="Nombre completo"
                  value={profile.fullName}
                  onChangeText={(value) => updateProfile('fullName', value)}
                  autoComplete="name"
                />
                <ProfileField label="Correo electrónico" value={profile.email} editable={false} />
                <ProfileField
                  label="Teléfono"
                  value={profile.phone}
                  onChangeText={(value) =>
                    updateProfile('phone', value.replace(/\D/g, '').slice(0, 9))
                  }
                  keyboardType="phone-pad"
                  placeholder="9 dígitos"
                />
                <ProfileField
                  label="Región"
                  value={profile.region}
                  onChangeText={(value) => updateProfile('region', value)}
                />
                <ProfileField
                  label="Comuna"
                  value={profile.comuna}
                  onChangeText={(value) => updateProfile('comuna', value)}
                />
                <ProfileField
                  label="Calle y número"
                  value={profile.street}
                  onChangeText={(value) => updateProfile('street', value)}
                  autoComplete="street-address"
                />

                {message ? (
                  <ThemedText
                    type="small"
                    style={{ color: isError ? theme.danger : '#20805A' }}
                    accessibilityRole={isError ? 'alert' : 'text'}
                  >
                    {message}
                  </ThemedText>
                ) : null}

                <Pressable
                  accessibilityRole="button"
                  disabled={isSaving}
                  onPress={() => void handleSave()}
                  style={({ pressed }) => [
                    styles.saveButton,
                    { backgroundColor: theme.primary },
                    pressed && styles.pressed,
                    isSaving && styles.disabled,
                  ]}
                >
                  {isSaving ? (
                    <ActivityIndicator color={theme.primaryForeground} />
                  ) : (
                    <ThemedText type="smallBold" themeColor="primaryForeground">
                      Guardar cambios
                    </ThemedText>
                  )}
                </Pressable>
              </>
            )}
          </ThemedView>

          <CustomerPresenceSetting />

          {isAdmin ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/admin')}
              style={({ pressed }) => [
                styles.adminButton,
                { borderColor: theme.primary },
                pressed && styles.pressed,
              ]}
            >
              <ThemedText type="smallBold" themeColor="primary">
                Panel de administración
              </ThemedText>
            </Pressable>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

type ProfileFieldProps = {
  label: string;
  value: string;
  editable?: boolean;
  onChangeText?: (value: string) => void;
  autoComplete?: 'name' | 'street-address';
  keyboardType?: 'default' | 'phone-pad';
  placeholder?: string;
};

function ProfileField({
  label,
  value,
  editable = true,
  onChangeText,
  autoComplete,
  keyboardType = 'default',
  placeholder,
}: ProfileFieldProps) {
  const theme = useTheme();

  return (
    <View style={styles.field}>
      <ThemedText type="smallBold">{label}</ThemedText>
      <TextInput
        accessibilityLabel={label}
        value={value}
        editable={editable}
        onChangeText={onChangeText}
        autoComplete={autoComplete}
        keyboardType={keyboardType}
        placeholder={placeholder}
        placeholderTextColor={theme.textSecondary}
        autoCapitalize="sentences"
        style={[
          styles.input,
          {
            color: theme.text,
            backgroundColor: theme.background,
            borderColor: theme.backgroundSelected,
          },
          !editable && styles.readOnly,
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    padding: Spacing.three,
  },
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    gap: Spacing.three,
  },
  header: {
    gap: Spacing.one,
    paddingVertical: Spacing.two,
  },
  profileCard: {
    padding: Spacing.three,
    gap: Spacing.three,
    borderRadius: Spacing.three,
  },
  sectionTitle: {
    fontSize: 20,
    lineHeight: 28,
  },
  field: {
    gap: Spacing.one,
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
  },
  readOnly: {
    opacity: 0.65,
  },
  loading: {
    minHeight: 90,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  saveButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Spacing.two,
  },
  adminButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: Spacing.two,
  },
  pressed: {
    opacity: 0.8,
  },
  disabled: {
    opacity: 0.7,
  },
});
