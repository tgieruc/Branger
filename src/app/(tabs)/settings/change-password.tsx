import { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useColors } from '@/hooks/useColors';
import { useToast } from '@/lib/toast';

export default function ChangePasswordScreen() {
  const { user } = useAuth();
  const colors = useColors();
  const router = useRouter();
  const toast = useToast();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const newRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  const handleChangePassword = async () => {
    if (newPassword.length < 6) {
      Alert.alert('Error', 'New password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }

    if (!user?.email) {
      Alert.alert('Error', 'Unable to verify account. Please sign out and sign in again.');
      return;
    }

    setLoading(true);

    // Verify current password
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    });

    if (signInError) {
      setLoading(false);
      Alert.alert('Error', 'Current password is incorrect');
      return;
    }

    // Update to new password
    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    });

    setLoading(false);

    if (updateError) {
      Alert.alert('Error', updateError.message);
      return;
    }

    toast.show('Password changed successfully!');
    router.back();
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={[styles.inputRow, { borderColor: colors.inputBorder, backgroundColor: colors.inputBackground }]}>
        <TextInput
          style={[styles.inputInner, { color: colors.text }]}
          placeholder="Current Password"
          placeholderTextColor={colors.placeholder}
          value={currentPassword}
          onChangeText={setCurrentPassword}
          secureTextEntry={!showCurrent}
          textContentType="password"
          returnKeyType="next"
          onSubmitEditing={() => newRef.current?.focus()}
          blurOnSubmit={false}
          accessibilityLabel="Current password"
        />
        <TouchableOpacity onPress={() => setShowCurrent(!showCurrent)} style={styles.eyeButton} accessibilityLabel={showCurrent ? 'Hide current password' : 'Show current password'}>
          <Ionicons name={showCurrent ? 'eye-off-outline' : 'eye-outline'} size={22} color={colors.textTertiary} />
        </TouchableOpacity>
      </View>
      <View style={[styles.inputRow, { borderColor: colors.inputBorder, backgroundColor: colors.inputBackground }]}>
        <TextInput
          ref={newRef}
          style={[styles.inputInner, { color: colors.text }]}
          placeholder="New Password"
          placeholderTextColor={colors.placeholder}
          value={newPassword}
          onChangeText={setNewPassword}
          secureTextEntry={!showNew}
          textContentType="newPassword"
          returnKeyType="next"
          onSubmitEditing={() => confirmRef.current?.focus()}
          blurOnSubmit={false}
          accessibilityLabel="New password"
        />
        <TouchableOpacity onPress={() => setShowNew(!showNew)} style={styles.eyeButton} accessibilityLabel={showNew ? 'Hide new password' : 'Show new password'}>
          <Ionicons name={showNew ? 'eye-off-outline' : 'eye-outline'} size={22} color={colors.textTertiary} />
        </TouchableOpacity>
      </View>
      <View style={[styles.inputRow, { borderColor: colors.inputBorder, backgroundColor: colors.inputBackground }]}>
        <TextInput
          ref={confirmRef}
          style={[styles.inputInner, { color: colors.text }]}
          placeholder="Confirm New Password"
          placeholderTextColor={colors.placeholder}
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry={!showConfirm}
          textContentType="newPassword"
          returnKeyType="done"
          onSubmitEditing={handleChangePassword}
          accessibilityLabel="Confirm new password"
        />
        <TouchableOpacity onPress={() => setShowConfirm(!showConfirm)} style={styles.eyeButton} accessibilityLabel={showConfirm ? 'Hide confirm password' : 'Show confirm password'}>
          <Ionicons name={showConfirm ? 'eye-off-outline' : 'eye-outline'} size={22} color={colors.textTertiary} />
        </TouchableOpacity>
      </View>
      <TouchableOpacity
        style={[styles.button, { backgroundColor: colors.primary }, loading && { opacity: 0.6 }]}
        onPress={handleChangePassword}
        disabled={loading}
        accessibilityLabel="Change password"
        accessibilityRole="button"
      >
        <Text style={[styles.buttonText, { color: colors.buttonText }]}>{loading ? 'Changing...' : 'Change Password'}</Text>
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, maxWidth: 600, width: '100%', alignSelf: 'center' },
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
});
