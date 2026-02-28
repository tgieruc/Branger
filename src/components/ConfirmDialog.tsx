import { Modal, Pressable, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useColors } from '@/hooks/useColors';

type Props = {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export default function ConfirmDialog({
  visible, title, message, confirmLabel = 'Delete', destructive = true, onConfirm, onCancel,
}: Props) {
  const colors = useColors();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={[styles.overlay, { backgroundColor: colors.modalOverlay }]} onPress={onCancel}>
        <Pressable style={[styles.content, { backgroundColor: colors.modalBackground }]} onPress={(e) => e.stopPropagation()}>
          <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
          <Text style={[styles.message, { color: colors.textSecondary }]}>{message}</Text>
          <View style={styles.buttons}>
            <TouchableOpacity style={[styles.cancelBtn, { backgroundColor: colors.cancelButton }]} onPress={onCancel}>
              <Text style={[styles.cancelText, { color: colors.cancelText }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.confirmBtn, { backgroundColor: destructive ? colors.danger : colors.primary }]} onPress={onConfirm}>
              <Text style={[styles.confirmText, { color: colors.buttonText }]}>{confirmLabel}</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1, justifyContent: 'center',
    alignItems: 'center', padding: 32,
  },
  content: {
    borderRadius: 16, padding: 20, width: '100%',
    maxWidth: 320,
  },
  title: { fontSize: 18, fontWeight: '600', textAlign: 'center', marginBottom: 8 },
  message: { fontSize: 15, textAlign: 'center', marginBottom: 20 },
  buttons: { flexDirection: 'row', gap: 12 },
  cancelBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 8,
    alignItems: 'center',
  },
  cancelText: { fontSize: 16 },
  confirmBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 8,
    alignItems: 'center',
  },
  confirmText: { fontSize: 16, fontWeight: '600' },
});
