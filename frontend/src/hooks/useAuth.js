import { useState } from 'react';

export function useAuth() {
  const [user, setUser] = useState(null);
  // Lógica de autenticación aquí
  return { user, setUser };
}
