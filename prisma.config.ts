import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "./prisma/schema.prisma",

  migrations: {
    // Seed command run via ts-node since the project uses TypeScript
    seed: 'ts-node prisma/seed.ts',
  },

  datasource: {
    url: process.env.DATABASE_URL!,
  },
});
