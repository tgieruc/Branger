import { useState, useEffect } from 'react';
import {
  Text, TextInput, TouchableOpacity, StyleSheet, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useColors } from '@/hooks/useColors';

type ScreenState = 'loading' | 'error' | 'ready';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ access_token?: string; refresh_token?: string; code?: string }>();
  const colors = useColors();
  const [state, setState] = useState<ScreenState>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const verifyTokens = async () => {
      // PKCE flow: exchange authorization code for session
      const code = params.code as string | undefined;
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          setErrorMessage('This reset link has expired. Please request a new one.');
          setState('error');
          return;
        }
        setState('ready');
        return;
      }

      // Implicit flow: extract tokens from deep link params or web URL hash
      let accessToken = params.access_token as string | undefined;
      let refreshToken = params.refresh_token as string | undefined;

      // On web, also check window.location.hash
      if (Platform.OS === 'web' && (!accessToken || !refreshToken)) {
        try {
          const hash = window.location.hash;
          if (hash) {
            const hashParams = new URLSearchParams(hash.substring(1));
            accessToken = accessToken || hashParams.get('access_token') || undefined;
            refreshToken = refreshToken || hashParams.get('refresh_token') || undefined;
          }
        } catch {
          // Ignore hash parsing errors
        }
      }

      if (!accessToken || !refreshToken) {
        setErrorMessage('Invalid or expired reset link. Please request a new one.');
        setState('error');
        return;
      }

      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      if (error) {
        setErrorMessage('This reset link has expired. Please request a new one.');
        setState('error');
        return;
      }

      setState('ready');
    };

    verifyTokens();
  }, [params.access_token, params.refresh_token, params.code]);

  const handleResetPassword = async () => {
    if (password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }

    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (updateError) {
      Alert.alert('Error', updateError.message);
      return;
    }

    Alert.alert('Success', 'Your password has been reset.', [
      { text: 'OK', onPress: () => router.replace('/(tabs)/recipes') },
    ]);
  };

  if (state === 'loading') {
    return (
      <KeyboardAvoidingView
        style={[styles.container, { backgroundColor: colors.background }]}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <Text style={[styles.loadingText, { color: colors.text }]}>Verifying reset link...</Text>
      </KeyboardAvoidingView>
    );
  }

  if (state === 'error') {
    return (
      <KeyboardAvoidingView
        style={[styles.container, { backgroundColor: colors.background }]}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <Text style={[styles.errorText, { color: colors.danger }]}>{errorMessage}</Text>
        <TouchableOpacity
          style={[styles.button, { backgroundColor: colors.primary }]}
          onPress={() => router.replace('/forgot-password')}
          accessibilityLabel="Request new reset link"
          accessibilityRole="button"
        >
          <Text style={styles.buttonText}>Request New Link</Text>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <Text style={[styles.title, { color: colors.text }]}>Set New Password</Text>
      <TextInput
        style={[styles.input, { borderColor: colors.inputBorder, backgroundColor: colors.inputBackground, color: colors.text }]}
        placeholder="New Password"
        placeholderTextColor={colors.placeholder}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        accessibilityLabel="New password"
      />
      <TextInput
        style={[styles.input, { borderColor: colors.inputBorder, backgroundColor: colors.inputBackground, color: colors.text }]}
        placeholder="Confirm New Password"
        placeholderTextColor={colors.placeholder}
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        secureTextEntry
        accessibilityLabel="Confirm new password"
      />
      <TouchableOpacity
        style={[styles.button, { backgroundColor: colors.primary }, loading && { opacity: 0.6 }]}
        onPress={handleResetPassword}
        disabled={loading}
        accessibilityLabel="Reset password"
        accessibilityRole="button"
      >
        <Text style={styles.buttonText}>{loading ? 'Resetting...' : 'Reset Password'}</Text>
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, maxWidth: 600, width: '100%', alignSelf: 'center' },
  title: { fontSize: 32, fontWeight: 'bold', textAlign: 'center', marginBottom: 48 },
  input: {
    borderWidth: 1, borderRadius: 8,
    padding: 12, marginBottom: 16, fontSize: 16,
  },
  button: {
    borderRadius: 8, padding: 16, alignItems: 'center',
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  loadingText: { fontSize: 16, textAlign: 'center' },
  errorText: { fontSize: 16, textAlign: 'center', marginBottom: 24 },
});
