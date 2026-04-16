// ===========================================================
// PRISMA SEED SCRIPT
// ===========================================================
// Seeds the database with initial data for development/testing
// Run with: npx prisma db seed
// Only use this in development — production data goes through APIs
// ===========================================================

import { PrismaClient, CardStatus, Role } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import "dotenv/config";

// Use the raw DATABASE_URL string so seed and app share the exact same
// connection path and do not diverge on adapter configuration details.
const adapter = new PrismaPg(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🌱 Starting database seed...");

  // ----------------------------------------------------------
  // Create admin user
  // bcrypt with 12 rounds: secure but not too slow for seeding
  // ----------------------------------------------------------
  const adminEmail = "admin@nfccard.com";
  const adminPlainPassword = "admin123!";
  const adminPassword = await bcrypt.hash(adminPlainPassword, 12);
  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      // Re-apply the seeded credentials on reruns so the seed file stays truthful
      // and login does not depend on whatever password happened to exist before.
      name: "System Admin",
      password: adminPassword,
      role: Role.ADMIN,
    },
    create: {
      name: "System Admin",
      email: adminEmail,
      password: adminPassword,
      role: Role.ADMIN,
    },
  });

  await prisma.profile.upsert({
    where: { userId: admin.id },
    update: {
      fullName: "System Admin",
      email: adminEmail,
      jobTitle: "Administrator",
      company: "NFC Card Admin",
    },
    create: {
      userId: admin.id,
      fullName: "System Admin",
      email: adminEmail,
      jobTitle: "Administrator",
      company: "NFC Card Admin",
    },
  });

  console.log(
    `✅ Admin user ready: ${admin.email} (password: ${adminPlainPassword})`,
  );

  // ----------------------------------------------------------
  // Create a demo regular user
  // ----------------------------------------------------------
  const userPassword = await bcrypt.hash("demo1234!", 12);
  const demoUser = await prisma.user.upsert({
    where: { email: "demo@nfccard.com" },
    update: {},
    create: {
      name: "Demo User",
      email: "demo@nfccard.com",
      password: userPassword,
      role: Role.USER,
    },
  });
  console.log(`✅ Demo user created: ${demoUser.email}`);

  // ----------------------------------------------------------
  // Create unassigned cards (as admin would generate in bulk)
  // Card IDs follow the pattern: CARD_XXXXXX (6 alphanumeric chars)
  // ----------------------------------------------------------
  const unassignedCards = ["CARD_8F3K2L", "CARD_9X1P4M", "CARD_3Z7Q5N"];
  for (const cardId of unassignedCards) {
    await prisma.card.upsert({
      where: { cardId },
      update: {},
      create: { cardId, status: CardStatus.UNASSIGNED },
    });
  }
  console.log(`✅ ${unassignedCards.length} unassigned cards created`);

  // ----------------------------------------------------------
  // Create an active card linked to demo user with full profile
  // ----------------------------------------------------------
  const activeCard = await prisma.card.upsert({
    where: { cardId: "CARD_DEMO1" },
    update: {},
    create: {
      cardId: "CARD_DEMO1",
      status: CardStatus.ACTIVE,
      userId: demoUser.id,
    },
  });

  // Create profile for demo user
  await prisma.profile.upsert({
    where: { userId: demoUser.id },
    update: {},
    create: {
      userId: demoUser.id,
      fullName: "Demo User",
      jobTitle: "Software Engineer",
      company: "Tech Startup Inc.",
      phone: "+250 788 000 001",
      email: "demo@nfccard.com",
      website: "https://demouser.dev",
      bio: "Passionate developer building the future of digital networking.",
      whatsapp: "250788000001",
      links: {
        create: [
          {
            type: "linkedin",
            label: "LinkedIn",
            url: "https://linkedin.com/in/demouser",
            order: 0,
          },
          {
            type: "twitter",
            label: "Twitter",
            url: "https://twitter.com/demouser",
            order: 1,
          },
          {
            type: "github",
            label: "GitHub",
            url: "https://github.com/demouser",
            order: 2,
          },
        ],
      },
    },
  });
  console.log(`✅ Active card CARD_DEMO1 created with full profile`);

  // ----------------------------------------------------------
  // Seed some historical scan events for analytics demo
  // ----------------------------------------------------------
  const scanData = [
    {
      device: "mobile",
      ip: "197.243.0.1",
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0)",
    },
    {
      device: "mobile",
      ip: "197.243.0.2",
      userAgent: "Mozilla/5.0 (Android 13; Mobile)",
    },
    {
      device: "desktop",
      ip: "197.243.0.3",
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64)",
    },
    {
      device: "mobile",
      ip: "197.243.0.4",
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0)",
    },
    {
      device: "desktop",
      ip: "197.243.0.5",
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X)",
    },
  ];

  // Create scans spread over the last 7 days for a realistic chart
  for (let i = 0; i < scanData.length; i++) {
    const daysAgo = Math.floor(i * 1.5);
    const timestamp = new Date();
    timestamp.setDate(timestamp.getDate() - daysAgo);

    await prisma.scan.create({
      data: {
        cardId: activeCard.id,
        timestamp,
        ...scanData[i],
      },
    });
  }
  console.log(`✅ ${scanData.length} demo scan events created`);

  console.log("\n Seed complete! You can now start the server.");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    // Always disconnect the Prisma client to prevent connection pool leaks
    await prisma.$disconnect();
  });
