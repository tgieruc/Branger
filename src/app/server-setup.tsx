import { useState } from 'react';
import {
  Text, TextInput, TouchableOpacity, StyleSheet, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { setServerUrl } from '@/lib/api';
import { useColors } from '@/hooks/useColors';

export default function ServerSetupScreen() {
  const colors = useColors();
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);

  const handleConnect = async () => {
    let trimmed = url.trim().replace(/\/$/, '');
    if (!trimmed) {
      Alert.alert('Error', 'Please enter a server URL');
      return;
    }
    // Auto-prepend http:// if no scheme provided
    if (!/^https?:\/\//i.test(trimmed)) {
      trimmed = `http://${trimmed}`;
    }

    setLoading(true);

    try {
      const resp = await fetch(`${trimmed}/api/health`, { method: 'GET' });
      if (!resp.ok) {
        Alert.alert('Error', 'Could not connect to server. Check the URL and try again.');
        setLoading(false);
        return;
      }
    } catch {
      Alert.alert('Error', 'Could not connect to server. Check the URL and try again.');
      setLoading(false);
      return;
    }

    await setServerUrl(trimmed);
    setLoading(false);
    router.replace('/login');
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <Text style={[styles.title, { color: colors.text }]}>Branger</Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        Enter the URL of your Branger server to get started.
      </Text>
      <TextInput
        style={[styles.input, { borderColor: colors.inputBorder, backgroundColor: colors.inputBackground, color: colors.text }]}
        placeholder="https://your-server.com"
        placeholderTextColor={colors.placeholder}
        value={url}
        onChangeText={setUrl}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        returnKeyType="done"
        onSubmitEditing={handleConnect}
        accessibilityLabel="Server URL"
      />
      <TouchableOpacity
        style={[styles.button, { backgroundColor: colors.primary }, loading && { opacity: 0.6 }]}
        onPress={handleConnect}
        disabled={loading}
        accessibilityLabel="Connect to server"
        accessibilityRole="button"
      >
        <Text style={[styles.buttonText, { color: colors.buttonText }]}>{loading ? 'Connecting...' : 'Connect'}</Text>
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, maxWidth: 600, width: '100%', alignSelf: 'center' },
  title: { fontSize: 32, fontWeight: 'bold', textAlign: 'center', marginBottom: 16 },
  subtitle: { fontSize: 16, textAlign: 'center', marginBottom: 32 },
  input: {
    borderWidth: 1, borderRadius: 8,
    padding: 12, marginBottom: 16, fontSize: 16,
  },
  button: {
    borderRadius: 8, padding: 16, alignItems: 'center',
  },
  buttonText: { fontSize: 16, fontWeight: '600' },
});
