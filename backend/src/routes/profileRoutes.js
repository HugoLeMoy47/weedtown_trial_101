// Rutas para perfil de usuario
const express = require('express');
const router = express.Router();

// Simulación de base de datos en memoria
let userProfile = {
  email: '',
  name: '',
  phone: '',
  fullName: '',
  bio: '',
  age: '',
  birthdate: '',
  gender: ''
};

// Obtener perfil
router.get('/', (req, res) => {
  res.json(userProfile);
});

// Validación simple de perfil
function validateProfile(data) {
  const errors = [];
  if (data.email && !/^\S+@\S+\.\S+$/.test(data.email)) errors.push('Correo inválido');
  if (data.phone && !/^\+?\d{7,15}$/.test(data.phone)) errors.push('Teléfono inválido');
  if (data.age && (isNaN(data.age) || data.age < 0 || data.age > 120)) errors.push('Edad inválida');
  if (data.birthdate && isNaN(Date.parse(data.birthdate))) errors.push('Fecha de nacimiento inválida');
  if (data.gender && !['masculino','femenino','otro',''].includes(data.gender)) errors.push('Género inválido');
  if (data.fullName && data.fullName.length < 2) errors.push('Nombre completo muy corto');
  return errors;
}

// Actualizar perfil
router.post('/', (req, res) => {
  const errors = validateProfile(req.body);
  if (errors.length > 0) {
    return res.status(400).json({ errors });
  }
  userProfile = { ...userProfile, ...req.body };
  res.json({ message: 'Perfil actualizado', user: userProfile });
});

module.exports = router;
