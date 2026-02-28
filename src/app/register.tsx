import { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Link, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth';
import { useColors } from '@/hooks/useColors';

export default function RegisterScreen() {
  const { signUp } = useAuth();
  const colors = useColors();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  const handleRegister = async () => {
    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }
    setLoading(true);
    const { error } = await signUp(email, password);
    if (error) {
      Alert.alert('Error', error.message);
    } else {
      Alert.alert('Success', 'Check your email to confirm your account', [
        { text: 'OK', onPress: () => router.replace('/login') },
      ]);
    }
    setLoading(false);
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <Text style={[styles.title, { color: colors.text }]}>Create Account</Text>
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
          textContentType="newPassword"
          returnKeyType="next"
          onSubmitEditing={() => confirmRef.current?.focus()}
          blurOnSubmit={false}
        />
        <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeButton} accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}>
          <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={22} color={colors.textTertiary} />
        </TouchableOpacity>
      </View>
      <Text style={[styles.hint, { color: colors.textTertiary }]}>At least 6 characters</Text>
      <View style={[styles.inputRow, { borderColor: colors.inputBorder, backgroundColor: colors.inputBackground }]}>
        <TextInput
          ref={confirmRef}
          style={[styles.inputInner, { color: colors.text }]}
          placeholder="Confirm Password"
          placeholderTextColor={colors.placeholder}
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry={!showConfirm}
          textContentType="newPassword"
          returnKeyType="done"
          onSubmitEditing={handleRegister}
        />
        <TouchableOpacity onPress={() => setShowConfirm(!showConfirm)} style={styles.eyeButton} accessibilityLabel={showConfirm ? 'Hide confirm password' : 'Show confirm password'}>
          <Ionicons name={showConfirm ? 'eye-off-outline' : 'eye-outline'} size={22} color={colors.textTertiary} />
        </TouchableOpacity>
      </View>
      <TouchableOpacity style={[styles.button, { backgroundColor: colors.primary }, loading && { opacity: 0.6 }]} onPress={handleRegister} disabled={loading}>
        <Text style={[styles.buttonText, { color: colors.buttonText }]}>{loading ? 'Creating...' : 'Create Account'}</Text>
      </TouchableOpacity>
      <Link href="/login" style={[styles.link, { color: colors.primary }]}>
        Already have an account? Sign In
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
  hint: { fontSize: 13, marginTop: -10, marginBottom: 16 },
  button: {
    borderRadius: 8, padding: 16, alignItems: 'center',
  },
  buttonText: { fontSize: 16, fontWeight: '600' },
  link: { marginTop: 16, textAlign: 'center' },
});
