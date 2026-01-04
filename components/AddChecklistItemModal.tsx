import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TextInput, TouchableOpacity, ScrollView } from 'react-native';
import { X, Plus, Trash2 } from 'lucide-react-native';

interface ChecklistItem {
  name: string;
  category: string;
}

interface AddChecklistItemModalProps {
  visible: boolean;
  onClose: () => void;
  onAdd: (item: ChecklistItem) => void;
  onDelete?: () => void; // Kişisel checklist silme fonksiyonu
  categories: string[];
  selectedCategory: string;
}

export default function AddChecklistItemModal({ 
  visible, 
  onClose, 
  onAdd, 
  onDelete, // yeni prop
  categories, 
  selectedCategory 
}: AddChecklistItemModalProps) {
  const [itemName, setItemName] = useState('');
  const [category, setCategory] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [isCreatingNewCategory, setIsCreatingNewCategory] = useState(false);

  useEffect(() => {
    setCategory(selectedCategory);
  }, [selectedCategory]);

  const handleSubmit = () => {
    if (!itemName.trim()) return;
    
    const finalCategory = isCreatingNewCategory ? newCategory.trim() : category;
    if (!finalCategory) return;

    onAdd({
      name: itemName.trim(),
      category: finalCategory,
    });

    setItemName('');
    setCategory(selectedCategory);
    setNewCategory('');
    setIsCreatingNewCategory(false);
    onClose();
  };

  const handleClose = () => {
    setItemName('');
    setCategory('');
    setNewCategory('');
    setIsCreatingNewCategory(false);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Yeni Öğe Ekle</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            {/* Silme butonu, sağda + ikonlu ekleme butonunun yanında */}
            {onDelete && (
              <TouchableOpacity onPress={onDelete} style={{ marginRight: 8, padding: 4 }}>
                <Trash2 size={22} color="#ef4444" />
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
              <X size={24} color="#6b7280" />
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView style={styles.content}>
          <View style={styles.section}>
            <Text style={styles.label}>Öğe Adı *</Text>
            <TextInput
              style={styles.input}
              value={itemName}
              onChangeText={setItemName}
              placeholder="Örn: Çakmak, Su şişesi, Battaniye..."
              autoFocus
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.label}>Kategori *</Text>
            
            {!isCreatingNewCategory ? (
              <View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
                  {categories.map((cat) => (
                    <TouchableOpacity
                      key={cat}
                      style={[
                        styles.categoryChip,
                        category === cat && styles.categoryChipSelected
                      ]}
                      onPress={() => setCategory(cat)}
                    >
                      <Text style={[
                        styles.categoryChipText,
                        category === cat && styles.categoryChipTextSelected
                      ]}>
                        {cat}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                
                <TouchableOpacity
                  style={styles.newCategoryButton}
                  onPress={() => setIsCreatingNewCategory(true)}
                >
                  <Plus size={16} color="#059669" />
                  <Text style={styles.newCategoryButtonText}>Yeni Kategori Oluştur</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View>
                <TextInput
                  style={styles.input}
                  value={newCategory}
                  onChangeText={setNewCategory}
                  placeholder="Yeni kategori adı..."
                />
                <View style={styles.categoryActions}>
                  <TouchableOpacity
                    style={styles.cancelCategoryButton}
                    onPress={() => {
                      setIsCreatingNewCategory(false);
                      setNewCategory('');
                    }}
                  >
                    <Text style={styles.cancelCategoryButtonText}>İptal</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity
            style={[
              styles.submitButton,
              (!itemName.trim() || (!category && !newCategory.trim())) && styles.submitButtonDisabled
            ]}
            onPress={handleSubmit}
            disabled={!itemName.trim() || (!category && !newCategory.trim())}
          >
            <Text style={styles.submitButtonText}>Öğeyi Ekle</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1f2937',
  },
  closeButton: {
    padding: 4,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  section: {
    marginBottom: 24,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: 'white',
  },
  categoryScroll: {
    marginBottom: 16,
  },
  categoryChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#f3f4f6',
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  categoryChipSelected: {
    backgroundColor: '#059669',
    borderColor: '#059669',
  },
  categoryChipText: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '500',
  },
  categoryChipTextSelected: {
    color: 'white',
  },
  newCategoryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#f0fdf4',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#059669',
    borderStyle: 'dashed',
  },
  newCategoryButtonText: {
    fontSize: 14,
    color: '#059669',
    fontWeight: '600',
    marginLeft: 8,
  },
  categoryActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 8,
  },
  cancelCategoryButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#f3f4f6',
    borderRadius: 6,
  },
  cancelCategoryButtonText: {
    fontSize: 14,
    color: '#6b7280',
    fontWeight: '500',
  },
  footer: {
    padding: 20,
    backgroundColor: 'white',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  submitButton: {
    backgroundColor: '#059669',
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    backgroundColor: '#9ca3af',
  },
  submitButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});
