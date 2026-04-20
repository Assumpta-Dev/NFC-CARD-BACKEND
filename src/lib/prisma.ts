import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is missing in environment variables");
}

const adapter = new PrismaPg(process.env.DATABASE_URL);

const prisma = new PrismaClient({ adapter });

export default prisma;
