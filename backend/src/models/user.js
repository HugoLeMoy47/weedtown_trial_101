// Modelo de usuario (ejemplo base para Prisma)
module.exports = {
  name: 'User',
  schema: {
    id: 'Int',
    email: 'String',
    password: 'String',
    name: 'String',
    avatar: 'String',
    createdAt: 'DateTime',
    updatedAt: 'DateTime',
    // Otros campos relevantes
  }
};
