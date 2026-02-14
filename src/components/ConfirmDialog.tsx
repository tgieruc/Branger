import { Modal, Pressable, View, Text, TouchableOpacity, StyleSheet } from 'react-native';

type Props = {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export default function ConfirmDialog({
  visible, title, message, confirmLabel = 'Delete', onConfirm, onCancel,
}: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.overlay} onPress={onCancel}>
        <View style={styles.content}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>
          <View style={styles.buttons}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.confirmBtn} onPress={onConfirm}>
              <Text style={styles.confirmText}>{confirmLabel}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center',
    alignItems: 'center', padding: 32,
  },
  content: {
    backgroundColor: '#fff', borderRadius: 16, padding: 20, width: '100%',
    maxWidth: 320,
  },
  title: { fontSize: 18, fontWeight: '600', textAlign: 'center', marginBottom: 8 },
  message: { fontSize: 15, color: '#666', textAlign: 'center', marginBottom: 20 },
  buttons: { flexDirection: 'row', gap: 12 },
  cancelBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 8, backgroundColor: '#f0f0f0',
    alignItems: 'center',
  },
  cancelText: { fontSize: 16, color: '#333' },
  confirmBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 8, backgroundColor: '#ff3b30',
    alignItems: 'center',
  },
  confirmText: { fontSize: 16, color: '#fff', fontWeight: '600' },
});
