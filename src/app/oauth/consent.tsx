import { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView, Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useColors } from '@/hooks/useColors';

export default function OAuthConsentScreen() {
  const { authorization_id } = useLocalSearchParams<{ authorization_id: string }>();
  const { session, loading: authLoading } = useAuth();
  const router = useRouter();
  const colors = useColors();

  const [details, setDetails] = useState<{ client_name: string; scopes: string[] } | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Redirect to login if unauthenticated, storing return URL
  useEffect(() => {
    if (authLoading) return;
    if (!session) {
      const returnUrl = authorization_id
        ? `/oauth/consent?authorization_id=${authorization_id}`
        : '/oauth/consent';
      AsyncStorage.setItem('oauth_return_url', returnUrl).then(() => {
        router.replace('/login');
      });
    }
  }, [session, authLoading, authorization_id, router]);

  // Fetch authorization details
  useEffect(() => {
    if (authLoading || !session) return;
    if (!authorization_id) {
      setLoadingDetails(false);
      return;
    }

    (async () => {
      try {
        const { data, error } = await (supabase.auth as any).oauth
          .getAuthorizationDetails(authorization_id);
        if (error) {
          Alert.alert('Error', 'Could not load authorization details. The link may have expired.');
          setLoadingDetails(false);
          return;
        }
        setDetails(data);
      } catch {
        Alert.alert('Error', 'An unexpected error occurred.');
      } finally {
        setLoadingDetails(false);
      }
    })();
  }, [session, authLoading, authorization_id]);

  const handleApprove = async () => {
    if (!authorization_id) return;
    setSubmitting(true);
    try {
      const { data, error } = await (supabase.auth as any).oauth
        .approveAuthorization(authorization_id);
      if (error) {
        Alert.alert('Error', 'Failed to approve authorization.');
        setSubmitting(false);
        return;
      }
      const redirectUrl: string = data?.redirect_to ?? data?.url ?? data?.redirect_uri ?? data;
      if (redirectUrl && typeof redirectUrl === 'string') {
        router.replace(redirectUrl as any);
      }
    } catch {
      Alert.alert('Error', 'An unexpected error occurred.');
      setSubmitting(false);
    }
  };

  const handleDeny = async () => {
    if (!authorization_id) return;
    setSubmitting(true);
    try {
      const { data, error } = await (supabase.auth as any).oauth
        .denyAuthorization(authorization_id);
      if (error) {
        Alert.alert('Error', 'Failed to deny authorization.');
        setSubmitting(false);
        return;
      }
      const redirectUrl: string = data?.redirect_to ?? data?.url ?? data?.redirect_uri ?? data;
      if (redirectUrl && typeof redirectUrl === 'string') {
        router.replace(redirectUrl as any);
      }
    } catch {
      Alert.alert('Error', 'An unexpected error occurred.');
      setSubmitting(false);
    }
  };

  if (authLoading || !session) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (loadingDetails) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!details) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Ionicons name="alert-circle-outline" size={48} color={colors.danger} />
        <Text style={[styles.errorTitle, { color: colors.text }]}>Authorization Not Found</Text>
        <Text style={[styles.errorSubtitle, { color: colors.textSecondary }]}>
          This authorization request has expired or is invalid.
        </Text>
      </View>
    );
  }

  const scopes = details.scopes ?? [];

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
    >
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.inputBorder }]}>
        <View style={styles.iconRow}>
          <Ionicons name="shield-checkmark-outline" size={40} color={colors.primary} />
        </View>

        <Text style={[styles.title, { color: colors.text }]}>Authorization Request</Text>

        <Text style={[styles.clientName, { color: colors.text }]}>
          {details.client_name}
        </Text>

        <Text style={[styles.description, { color: colors.textSecondary }]}>
          is requesting access to your Branger account.
        </Text>

        {scopes.length > 0 && (
          <View style={styles.scopesSection}>
            <Text style={[styles.scopesLabel, { color: colors.text }]}>Requested permissions:</Text>
            {scopes.map((scope: string) => (
              <View key={scope} style={styles.scopeRow}>
                <Ionicons name="checkmark-circle-outline" size={18} color={colors.primary} style={styles.scopeIcon} />
                <Text style={[styles.scopeText, { color: colors.textSecondary }]}>{scope}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      <TouchableOpacity
        style={[styles.approveButton, { backgroundColor: colors.primary }, submitting && styles.disabled]}
        onPress={handleApprove}
        disabled={submitting}
        accessibilityLabel="Approve authorization"
        accessibilityRole="button"
      >
        {submitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.approveText}>Allow Access</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.denyButton, { borderColor: colors.danger }, submitting && styles.disabled]}
        onPress={handleDeny}
        disabled={submitting}
        accessibilityLabel="Deny authorization"
        accessibilityRole="button"
      >
        <Text style={[styles.denyText, { color: colors.danger }]}>Deny</Text>
      </TouchableOpacity>

      <Text style={[styles.footer, { color: colors.textSecondary }]}>
        You can revoke access at any time from your account settings.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 24, paddingBottom: 48, maxWidth: 600, width: '100%', alignSelf: 'center' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', maxWidth: 600, width: '100%', alignSelf: 'center' },
  card: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 24,
    marginBottom: 24,
  },
  iconRow: { alignItems: 'center', marginBottom: 16 },
  title: { fontSize: 22, fontWeight: 'bold', textAlign: 'center', marginBottom: 12 },
  clientName: { fontSize: 18, fontWeight: '600', textAlign: 'center', marginBottom: 4 },
  description: { fontSize: 15, textAlign: 'center', marginBottom: 20 },
  scopesSection: { marginTop: 8 },
  scopesLabel: { fontSize: 14, fontWeight: '600', marginBottom: 10 },
  scopeRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  scopeIcon: { marginRight: 8 },
  scopeText: { fontSize: 14, flex: 1 },
  approveButton: {
    borderRadius: 8, padding: 16, alignItems: 'center', marginBottom: 12,
  },
  approveText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  denyButton: {
    borderRadius: 8, padding: 16, alignItems: 'center', borderWidth: 1.5, marginBottom: 24,
  },
  denyText: { fontSize: 16, fontWeight: '600' },
  disabled: { opacity: 0.6 },
  errorTitle: { fontSize: 20, fontWeight: '600', marginTop: 16, marginBottom: 8, textAlign: 'center' },
  errorSubtitle: { fontSize: 15, textAlign: 'center', paddingHorizontal: 24 },
  footer: { fontSize: 13, textAlign: 'center' },
});
