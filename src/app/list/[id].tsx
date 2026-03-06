import { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useColors } from '@/hooks/useColors';

export default function JoinListScreen() {
  const { id, token } = useLocalSearchParams<{ id: string; token: string }>();
  const router = useRouter();
  const { session, loading: authLoading } = useAuth();
  const colors = useColors();
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    if (authLoading) return;

    if (!token) {
      Alert.alert('Error', 'Invalid invite link');
      router.replace('/(tabs)/lists');
      return;
    }

    if (!session) {
      AsyncStorage.setItem('pendingListJoin', `${id}:${token}`).then(() => {
        router.replace('/login');
      });
      return;
    }

    setJoining(true);
    supabase.rpc('join_list', { p_list_id: id, p_invite_token: token }).then(({ error }) => {
      setJoining(false);
      if (error) {
        Alert.alert('Error', error.message || 'Could not join list');
        router.replace('/(tabs)/lists');
        return;
      }
      router.replace(`/(tabs)/lists/${id}` as any);
    });
  }, [session, authLoading, id, token, router]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ActivityIndicator size="large" color={colors.primaryText} />
      <Text style={[styles.text, { color: colors.textSecondary }]}>
        {joining ? 'Joining list...' : 'Loading...'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  text: { marginTop: 16, fontSize: 16 },
});
