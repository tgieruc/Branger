import { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Link } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth';
import { useColors } from '@/hooks/useColors';

export default function LoginScreen() {
  const { signIn } = useAuth();
  const colors = useColors();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const passwordRef = useRef<TextInput>(null);

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
        returnKeyType="next"
        textContentType="emailAddress"
        onSubmitEditing={() => passwordRef.current?.focus()}
        blurOnSubmit={false}
      />
      <View style={[styles.inputRow, { borderColor: colors.inputBorder, backgroundColor: colors.inputBackground }]}>
        <TextInput
          ref={passwordRef}
          style={[styles.inputInner, { color: colors.text }]}
          placeholder="Password"
          placeholderTextColor={colors.placeholder}
          value={password}
          onChangeText={setPassword}
          secureTextEntry={!showPassword}
          returnKeyType="done"
          textContentType="password"
          onSubmitEditing={handleLogin}
        />
        <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeButton} accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}>
          <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={22} color={colors.textTertiary} />
        </TouchableOpacity>
      </View>
      <TouchableOpacity style={[styles.button, { backgroundColor: colors.primary }, loading && { opacity: 0.6 }]} onPress={handleLogin} disabled={loading}>
        <Text style={[styles.buttonText, { color: colors.buttonText }]}>{loading ? 'Signing in...' : 'Sign In'}</Text>
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
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    marginBottom: 16,
  },
  inputInner: {
    flex: 1,
    padding: 12,
    fontSize: 16,
  },
  eyeButton: {
    padding: 12,
  },
  button: {
    borderRadius: 8, padding: 16, alignItems: 'center',
  },
  buttonText: { fontSize: 16, fontWeight: '600' },
  forgotLink: { marginTop: 12, textAlign: 'center', fontSize: 14 },
  link: { marginTop: 16, textAlign: 'center' },
});
