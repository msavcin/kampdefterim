import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal } from 'react-native';
import { useTheme } from './ThemeProvider';

interface HelpModalProps {
  visible: boolean;
  onClose: () => void;
}

const HelpModal: React.FC<HelpModalProps> = ({ visible, onClose }) => {
  const { colors } = useTheme();
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
        <View style={[styles.container, { backgroundColor: colors.surface }]}>
          <Text style={[styles.title, { color: colors.primary }]}>Hoş geldiniz!</Text>
          <Text style={[styles.text, { color: colors.text }]}>
            • Uygulama ilk açılışında, kamp alanları ve duyuru güncellemesi için sunucuyla senkronizasyon yapacaktır. Eşitleme bitene kadar duyuru ekranına erişim kısıtlanmıştır.{"\n"}
            • Tüm sürüm notlarına 
            <Text style={{color:'#2563eb'}} onPress={() => {require('react-native').Linking.openURL('https://kampdefterim.com/surum-notlari.html')}}> buradan</Text> ulaşabilirsin.{"\n"}
            • Görüş ve önerileriniz uygulama içi bildirim alanından ya da 
            <Text style={{color:'#2563eb'}} onPress={() => {require('react-native').Linking.openURL('mailto:kampdefterim@gmail.com')}}> kampdefterim@gmail.com</Text> adresinden iletebilirsiniz.{"\n"}
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
    borderRadius: 16,
    padding: 28,
    width: '85%',
    alignItems: 'center',
    elevation: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  text: {
    fontSize: 15,
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

export default HelpModal;
