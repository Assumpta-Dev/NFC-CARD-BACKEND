import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  try {
    await prisma.$executeRawUnsafe(`
      ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'BUSINESS';
    `);

    console.log("Enum updated");
  } catch (error) {
    console.error("Failed to update enum:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();