import React, { useState } from 'react';
import { View, Text, TextInput, Button, StyleSheet, Alert } from 'react-native';
import axios from 'axios';

export default function ProfileScreen({ user, setUser }) {
  const [form, setForm] = useState({
    phone: user?.phone || '',
    fullName: user?.fullName || '',
    bio: user?.bio || '',
    age: user?.age || '',
    birthdate: user?.birthdate || '',
    gender: user?.gender || ''
  });
  const [loading, setLoading] = useState(false);

  const handleChange = (name, value) => {
    setForm({ ...form, [name]: value });
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      await axios.post('http://localhost:4000/api/profile', form);
      setUser({ ...user, ...form });
      Alert.alert('Éxito', 'Perfil actualizado correctamente');
    } catch {
      Alert.alert('Error', 'No se pudo actualizar el perfil');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Mi perfil</Text>
      <TextInput style={styles.input} placeholder="Nombre completo" value={form.fullName} onChangeText={v => handleChange('fullName', v)} />
      <TextInput style={styles.input} placeholder="Teléfono" value={form.phone} onChangeText={v => handleChange('phone', v)} />
      <TextInput style={styles.input} placeholder="Edad" value={form.age} onChangeText={v => handleChange('age', v)} />
      <TextInput style={styles.input} placeholder="Fecha de nacimiento" value={form.birthdate} onChangeText={v => handleChange('birthdate', v)} />
      <TextInput style={styles.input} placeholder="Género" value={form.gender} onChangeText={v => handleChange('gender', v)} />
      <TextInput style={styles.input} placeholder="Biografía" value={form.bio} onChangeText={v => handleChange('bio', v)} multiline />
      <Button title={loading ? 'Guardando...' : 'Guardar cambios'} onPress={handleSubmit} disabled={loading} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: '#181818' },
  title: { color: '#fff', fontSize: 24, marginBottom: 16 },
  input: { backgroundColor: '#fff', marginBottom: 12, padding: 8, borderRadius: 6 }
});
