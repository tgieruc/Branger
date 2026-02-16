import { useState } from 'react';
import {
  Text, TextInput, TouchableOpacity, StyleSheet, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Link } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { useColors } from '@/hooks/useColors';

export default function LoginScreen() {
  const { signIn } = useAuth();
  const colors = useColors();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setLoading(true);
    const { error } = await signIn(email, password);
    if (error) Alert.alert('Error', error.message);
    setLoading(false);
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <Text style={[styles.title, { color: colors.text }]}>Branger</Text>
      <TextInput
        style={[styles.input, { borderColor: colors.inputBorder, backgroundColor: colors.inputBackground, color: colors.text }]}
        placeholder="Email"
        placeholderTextColor={colors.placeholder}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <TextInput
        style={[styles.input, { borderColor: colors.inputBorder, backgroundColor: colors.inputBackground, color: colors.text }]}
        placeholder="Password"
        placeholderTextColor={colors.placeholder}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />
      <TouchableOpacity style={[styles.button, { backgroundColor: colors.primary }, loading && { opacity: 0.6 }]} onPress={handleLogin} disabled={loading}>
        <Text style={styles.buttonText}>{loading ? 'Signing in...' : 'Sign In'}</Text>
      </TouchableOpacity>
      <Link href="/forgot-password" style={[styles.forgotLink, { color: colors.textSecondary }]}>
        Forgot Password?
      </Link>
      <Link href="/register" style={[styles.link, { color: colors.primary }]}>
        Don&apos;t have an account? Sign Up
      </Link>
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
  forgotLink: { marginTop: 12, textAlign: 'center', fontSize: 14 },
  link: { marginTop: 16, textAlign: 'center' },
});
