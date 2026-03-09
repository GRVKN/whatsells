import { PrismaClient } from "@prisma/client";
import crypto from "node:crypto";

const prisma = new PrismaClient();

async function main() {
  const campaigns = await prisma.campaign.findMany({
    where: { publicToken: null },
    select: { id: true },
  });

  for (const campaign of campaigns) {
    await prisma.campaign.update({
      where: { id: campaign.id },
      data: {
        publicToken: crypto.randomUUID().replace(/-/g, ""),
      },
    });
  }

  console.log(`Updated ${campaigns.length} campaign(s).`);
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });