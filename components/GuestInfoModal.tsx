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
      animationType="slide"
      transparent
      onRequestClose={onClose}
      hardwareAccelerated
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          <Text style={styles.title}>Hoşgeldiniz</Text>
          <Text style={styles.text}>
            Misafir olarak giriş yapıyorsunuz. Uygulamamızdaki tüm özellikleri test edebilirsiniz.{"\n\n"}
            Uygulamayı beğendiğiniz takdirde, kendi hesabınızı oluşturup 1 ay ücretsiz üyeliğinizi başlatabilirsiniz.{"\n\n"} 
            Ücretsiz üyeliğinizin sonunda{' '}
            <Text
              style={styles.link}
              onPress={() => {
                // WebView veya Linking ile açılabilir
                // import { Linking } from 'react-native';
                // Linking.openURL('https://kampdefterim.com/kisitli-erisim.html');
                require('react-native').Linking.openURL('https://kampdefterim.com/kisitli-erisim.html');
              }}
            >
              <Text style={{ fontWeight: 'bold', fontStyle: 'italic', color: '#3730a3', textDecorationLine: 'underline' }}>
              kısıtlı kullanımla
              </Text>
            </Text>
            &nbsp;uygulamayı kullanmaya devam edebilirsiniz.{"\n\n"}
            * Misafir oturumunda yapılan değişiklikler her ay başında sıfırlanmaktadır.{"\n\n"} 
            Kişisel alanlarınızı oluşturmak için lütfen hesap oluşturun.{"\n\n"}
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
  link: {
    // Ekstra stil istenirse buraya eklenebilir
  },
});

export default GuestInfoModal;