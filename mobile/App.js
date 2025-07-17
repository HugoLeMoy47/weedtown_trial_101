import React, { useState } from 'react';
import { View, Text, Button } from 'react-native';
import ProfileScreen from './ProfileScreen';

export default function App() {
  const [user, setUser] = useState({ name: 'UsuarioDemo' });
  const [showProfile, setShowProfile] = useState(false);

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#181818' }}>
      {showProfile ? (
        <ProfileScreen user={user} setUser={setUser} />
      ) : (
        <>
          <Text style={{ color: '#fff', fontSize: 24 }}>WeedTown Mobile</Text>
          <Text style={{ color: '#fff', marginVertical: 16 }}>Bienvenido, {user.name}</Text>
          <Button title="Mi perfil" onPress={() => setShowProfile(true)} />
        </>
      )}
    </View>
  );
}
