const { PrismaClient } = require("@prisma/client");

async function run() {
  const prisma = new PrismaClient();
  const tables = await prisma.$queryRawUnsafe(
    'SELECT name FROM sqlite_master WHERE type="table";'
  );
  console.log(tables);
  await prisma.$disconnect();
}

run().catch(console.error);