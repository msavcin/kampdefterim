import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal } from 'react-native';

interface GuestInfoModalProps {
  visible: boolean;
  onClose: () => void;
}

const GuestInfoModal: React.FC<GuestInfoModalProps> = ({ visible, onClose }) => {
  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          <Text style={styles.title}>Hoşgeldiniz</Text>
          <Text style={styles.text}>
            Misafir olarak giriş yaptınız. Uygulamamızdaki tüm özellikleri "Misafir" oturumunda test edebilirsiniz.{"\n\n"}
            Uygulamayı beğendiyseniz, kendi hesabınızı oluşturup 1 ay ücretsiz üyeliğinizi başlatabilirsiniz. Ücretsiz süre sonunda kısıtlı kullanımla uygulamayı kullanmaya devam edebilirsiniz.{"\n\n"}
            * Misafir oturumunda yaptığınız değişikler her ay başında resetlenmektedir.
          </Text>
          <TouchableOpacity style={styles.button} onPress={onClose}>
            <Text style={styles.buttonText}>Tamam</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 28,
    width: '85%',
    alignItems: 'center',
    elevation: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#3730a3',
    marginBottom: 12,
  },
  text: {
    fontSize: 15,
    color: '#334155',
    marginBottom: 18,
    textAlign: 'left',
  },
  button: {
    backgroundColor: '#6366f1',
    borderRadius: 8,
    paddingHorizontal: 24,
    paddingVertical: 10,
  },
  buttonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 15,
  },
});

export default GuestInfoModal;