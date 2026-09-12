const { PrismaClient } = require('@prisma/client');

async function main() {
  const url = "postgresql://postgres.oegxbgsqtbkqyogeljwh:MS0KWKOJ6soVwW7d@aws-0-us-west-1.pooler.supabase.com:5432/postgres?schema=weedtown_test";
  console.log('Testing connection to port 5432...');
  const prisma = new PrismaClient({ datasourceUrl: url });
  try {
    const res = await prisma.$queryRawUnsafe('SELECT 1 as res');
    console.log('Port 5432 Query result:', res);
  } catch (err) {
    console.error('Port 5432 Error:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
