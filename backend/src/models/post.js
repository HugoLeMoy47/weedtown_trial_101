// Modelo de posteo (ejemplo base para Prisma)
module.exports = {
  name: 'Post',
  schema: {
    id: 'Int',
    authorId: 'Int',
    content: 'String',
    image: 'String',
    createdAt: 'DateTime',
    updatedAt: 'DateTime',
    // Otros campos relevantes
  }
};
