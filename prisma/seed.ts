// ===========================================================
// PRISMA SEED SCRIPT
// ===========================================================
// Seeds the database with initial data for development/testing
// Run with: npx prisma db seed
// Only use this in development - production data goes through APIs
// ===========================================================

import dotenv from "dotenv";
dotenv.config();

import { PrismaClient, CardStatus, Role } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const adapter = new PrismaPg(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Seeding database...");

  // =========================================================
  // ADMIN USER
  // =========================================================
  const adminEmail = "admin@nfccard.com";
  const adminPasswordHash = await bcrypt.hash("admin123!", 12);

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      name: "System Admin",
      password: adminPasswordHash,
      role: Role.ADMIN,
    },
    create: {
      name: "System Admin",
      email: adminEmail,
      password: adminPasswordHash,
      role: Role.ADMIN,
    },
  });

  await prisma.profile.upsert({
    where: { userId: admin.id },
    update: {
      fullName: "System Admin",
      email: adminEmail,
      jobTitle: "Administrator",
      company: "E-Card Admin",
    },
    create: {
      userId: admin.id,
      fullName: "System Admin",
      email: adminEmail,
      jobTitle: "Administrator",
      company: "E-Card Admin",
    },
  });

  console.log(`Admin created: ${admin.email}`);

  // =========================================================
  // DEMO USER
  // =========================================================
  const demoPasswordHash = await bcrypt.hash("demo1234!", 12);

  const demoUser = await prisma.user.upsert({
    where: { email: "demo@nfccard.com" },
    update: {},
    create: {
      name: "Demo User",
      email: "demo@nfccard.com",
      password: demoPasswordHash,
      role: Role.USER,
    },
  });

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
      bio: "Passionate developer building digital networking solutions.",
      whatsapp: "250788000001",
    },
  });

  console.log(`Demo user created: ${demoUser.email}`);

  // =========================================================
  // DEMO BUSINESS USER
  // =========================================================
  const businessEmail = "business@nfccard.com";
  const businessPasswordHash = await bcrypt.hash("business123!", 12);

  const demoBusinessUser = await prisma.user.upsert({
    where: { email: businessEmail },
    update: {
      name: "Mama Kitchen",
      password: businessPasswordHash,
      role: Role.BUSINESS,
    },
    create: {
      name: "Mama Kitchen",
      email: businessEmail,
      password: businessPasswordHash,
      role: Role.BUSINESS,
    },
  });

  await prisma.profile.upsert({
    where: { userId: demoBusinessUser.id },
    update: {
      fullName: "Mama Kitchen",
      email: businessEmail,
      jobTitle: "Restaurant Owner",
      company: "Mama Kitchen",
    },
    create: {
      userId: demoBusinessUser.id,
      fullName: "Mama Kitchen",
      email: businessEmail,
      jobTitle: "Restaurant Owner",
      company: "Mama Kitchen",
    },
  });

  const demoBusinessProfile = await prisma.businessProfile.upsert({
    where: { userId: demoBusinessUser.id },
    update: {
      name: "Mama Kitchen",
      category: "restaurant",
      description: "Home-style meals, fresh juice, and breakfast favorites.",
      location: "Kigali, Rwanda",
      phone: "0788000002",
      email: businessEmail,
      website: "https://mamakitchen.rw",
    },
    create: {
      userId: demoBusinessUser.id,
      name: "Mama Kitchen",
      category: "restaurant",
      description: "Home-style meals, fresh juice, and breakfast favorites.",
      location: "Kigali, Rwanda",
      phone: "0788000002",
      email: businessEmail,
      website: "https://mamakitchen.rw",
    },
  });

  console.log(`Demo business created: ${demoBusinessUser.email}`);

  // =========================================================
  // CARDS
  // =========================================================
  const unassignedCards = ["CARD_8F3K2L", "CARD_9X1P4M", "CARD_3Z7Q5N"];

  for (const cardId of unassignedCards) {
    await prisma.card.upsert({
      where: { cardId },
      update: {},
      create: {
        cardId,
        status: CardStatus.UNASSIGNED,
      },
    });
  }

  console.log("Unassigned cards created");

  // =========================================================
  // ACTIVE PERSONAL CARD
  // =========================================================
  const activeCard = await prisma.card.upsert({
    where: { cardId: "CARD_DEMO1" },
    update: {
      status: CardStatus.ACTIVE,
      userId: demoUser.id,
    },
    create: {
      cardId: "CARD_DEMO1",
      status: CardStatus.ACTIVE,
      userId: demoUser.id,
    },
  });

  // =========================================================
  // ACTIVE BUSINESS CARD
  // =========================================================
  await prisma.card.upsert({
    where: { cardId: "CARD_BIZ01" },
    update: {
      status: CardStatus.ACTIVE,
      userId: demoBusinessUser.id,
      businessProfileId: demoBusinessProfile.id,
    } as any,
    create: {
      cardId: "CARD_BIZ01",
      status: CardStatus.ACTIVE,
      userId: demoBusinessUser.id,
      businessProfileId: demoBusinessProfile.id,
    } as any,
  });

  console.log("Business card created");

  // =========================================================
  // BUSINESS MENUS
  // =========================================================
  const breakfastMenu = await ensureMenu(demoBusinessProfile.id, "Breakfast");
  const drinksMenu = await ensureMenu(demoBusinessProfile.id, "Drinks");

  await ensureMenuItem(
    breakfastMenu.id,
    "Rolex Wrap",
    3500,
    "Chapati rolled with egg, vegetables, and house sauce.",
  );
  await ensureMenuItem(
    breakfastMenu.id,
    "Mandazi Plate",
    2500,
    "Freshly baked mandazi served with tea.",
  );
  await ensureMenuItem(
    drinksMenu.id,
    "Passion Juice",
    2000,
    "Fresh passion fruit juice served cold.",
  );
  await ensureMenuItem(
    drinksMenu.id,
    "African Tea",
    1800,
    "Spiced milk tea with ginger and cardamom.",
  );

  console.log("Business menus seeded");

  // =========================================================
  // SCAN DATA
  // =========================================================
  const scanData = [
    { device: "mobile", ip: "197.243.0.1", userAgent: "iPhone" },
    { device: "mobile", ip: "197.243.0.2", userAgent: "Android" },
    { device: "desktop", ip: "197.243.0.3", userAgent: "Windows" },
    { device: "mobile", ip: "197.243.0.4", userAgent: "iPhone" },
    { device: "desktop", ip: "197.243.0.5", userAgent: "MacOS" },
  ];

  for (let i = 0; i < scanData.length; i++) {
    const date = new Date();
    date.setDate(date.getDate() - i);

    await prisma.scan.create({
      data: {
        cardId: activeCard.id,
        timestamp: date,
        ...scanData[i],
      },
    });
  }

  console.log("Scan analytics seeded");
  console.log("Seed completed successfully");
}

async function ensureMenu(businessId: string, title: string) {
  const existingMenu = await prisma.menu.findFirst({
    where: { businessId, title },
  });

  if (existingMenu) {
    return existingMenu;
  }

  return prisma.menu.create({
    data: {
      businessId,
      title,
    },
  });
}

async function ensureMenuItem(
  menuId: string,
  name: string,
  price: number,
  description: string,
) {
  const existingItem = await prisma.menuItem.findFirst({
    where: { menuId, name },
  });

  if (existingItem) {
    return prisma.menuItem.update({
      where: { id: existingItem.id },
      data: { price, description },
    });
  }

  return prisma.menuItem.create({
    data: {
      menuId,
      name,
      price,
      description,
    },
  });
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
