const { PrismaClient } = require("@prisma/client");
const { randomUUID } = require("crypto");

const prisma = new PrismaClient();

async function main() {
  const campaigns = await prisma.campaign.findMany({
    where: {
      OR: [
        { publicToken: null },
        { publicToken: "" },
      ],
    },
    select: {
      id: true,
      publicToken: true,
      name: true,
    },
  });

  for (const campaign of campaigns) {
    const token = randomUUID().replace(/-/g, "");
    await prisma.campaign.update({
      where: { id: campaign.id },
      data: { publicToken: token },
    });

    console.log(`Updated campaign ${campaign.name || campaign.id} -> ${token}`);
  }

  console.log(`Updated ${campaigns.length} campaign(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });