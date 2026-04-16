import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Use the raw DATABASE_URL string so seed and app share the exact same
// connection path and do not diverge on adapter configuration details.
const adapter = new PrismaPg(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

export default prisma;
