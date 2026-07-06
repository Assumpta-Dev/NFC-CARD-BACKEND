import prisma from "../lib/prisma";

interface OrderItemSnapshot {
  id?: string;
  name: string;
  price: number;
  qty: number;
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysAgo(days: number) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - days + 1);
  return d;
}

function buildDailyMap(rangeDays: number) {
  const map = new Map<string, number>();
  const now = new Date();
  for (let i = rangeDays - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    map.set(d.toISOString().split("T")[0], 0);
  }
  return map;
}

export const BusinessAnalyticsService = {
  async getBusinessIdForUser(userId: string) {
    const business = await prisma.businessProfile.findUnique({
      where: { userId },
      select: { id: true, name: true, paymentCode: true, imageUrl: true },
    });
    return business;
  },

  async getEarningsDashboard(businessId: string) {
    const orders = await prisma.order.findMany({
      where: { businessId },
      orderBy: { createdAt: "desc" },
    });

    const todayStart = startOfToday();
    const weekStart = daysAgo(7);
    const monthStart = daysAgo(30);

    const paid = orders.filter((o) => o.status === "PAID");
    const sumPaidSince = (since: Date) =>
      paid
        .filter((o) => new Date(o.createdAt) >= since)
        .reduce((sum, o) => sum + o.total, 0);

    const countByStatus = (status: string) =>
      orders.filter((o) => o.status === status).length;

    const paidToday = paid.filter((o) => new Date(o.createdAt) >= todayStart);
    const avgOrderValue =
      paid.length > 0
        ? Math.round(paid.reduce((s, o) => s + o.total, 0) / paid.length)
        : 0;

    const revenueDailyMap = buildDailyMap(30);
    for (const order of paid) {
      const day = new Date(order.createdAt).toISOString().split("T")[0];
      if (revenueDailyMap.has(day)) {
        revenueDailyMap.set(day, (revenueDailyMap.get(day) || 0) + order.total);
      }
    }
    const dailyRevenue = Array.from(revenueDailyMap.entries()).map(
      ([date, amount]) => ({ date, amount }),
    );

    const itemMap = new Map<string, { name: string; qty: number; revenue: number }>();
    for (const order of paid) {
      const items = order.items as unknown as OrderItemSnapshot[];
      for (const item of items) {
        const key = item.id || item.name;
        const existing = itemMap.get(key) || {
          name: item.name,
          qty: 0,
          revenue: 0,
        };
        existing.qty += item.qty;
        existing.revenue += item.price * item.qty;
        itemMap.set(key, existing);
      }
    }
    const topItems = Array.from(itemMap.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    const ordersDailyMap = buildDailyMap(30);
    for (const order of orders) {
      const day = new Date(order.createdAt).toISOString().split("T")[0];
      if (ordersDailyMap.has(day)) {
        ordersDailyMap.set(day, (ordersDailyMap.get(day) || 0) + 1);
      }
    }
    const dailyOrders = Array.from(ordersDailyMap.entries()).map(
      ([date, count]) => ({ date, count }),
    );

    const business = await prisma.businessProfile.findUnique({
      where: { id: businessId },
      include: {
        menus: { include: { items: true } },
        cards: { select: { id: true, cardId: true, status: true } },
      },
    });

    const menuItemCount =
      business?.menus.reduce((sum, menu) => sum + menu.items.length, 0) ?? 0;

    return {
      revenue: {
        today: sumPaidSince(todayStart),
        week: sumPaidSince(weekStart),
        month: sumPaidSince(monthStart),
        allTime: paid.reduce((sum, o) => sum + o.total, 0),
      },
      orders: {
        total: orders.length,
        pending: countByStatus("PENDING"),
        waitingVerification: countByStatus("WAITING_VERIFICATION"),
        paid: countByStatus("PAID"),
        rejected: countByStatus("REJECTED"),
        paidToday: paidToday.length,
        avgOrderValue,
      },
      dailyRevenue,
      dailyOrders,
      topItems,
      recentOrders: orders.slice(0, 6).map((o) => ({
        id: o.id,
        customerName: o.customerName,
        total: o.total,
        status: o.status,
        createdAt: o.createdAt,
        orderContext: o.orderContext,
        tableNumber: o.tableNumber,
        roomNumber: o.roomNumber,
      })),
      setup: {
        hasProfile: Boolean(business?.name),
        hasPaymentCode: Boolean(business?.paymentCode),
        hasMenuItems: menuItemCount > 0,
        hasLinkedCard: (business?.cards.length ?? 0) > 0,
        menuItemCount,
        linkedCardCount: business?.cards.length ?? 0,
      },
      businessName: business?.name ?? "Your Business",
    };
  },

  async getScanAnalytics(businessId: string, cardPublicId?: string) {
    const cards = await prisma.card.findMany({
      where: { businessProfileId: businessId },
      select: {
        id: true,
        cardId: true,
        status: true,
        _count: { select: { scans: true } },
      },
    });

    if (cards.length === 0) {
      return {
        cards: [],
        summary: { today: 0, week: 0, total: 0 },
        analytics: null,
      };
    }

    const targetCard = cardPublicId
      ? cards.find((c) => c.cardId === cardPublicId)
      : cards[0];

    if (cardPublicId && !targetCard) {
      return null;
    }

    const cardIds = cards.map((c) => c.id);
    const todayStart = startOfToday();
    const weekStart = daysAgo(7);

    const [today, week, total, last30Scans] = await Promise.all([
      prisma.scan.count({
        where: { cardId: { in: cardIds }, timestamp: { gte: todayStart } },
      }),
      prisma.scan.count({
        where: { cardId: { in: cardIds }, timestamp: { gte: weekStart } },
      }),
      prisma.scan.count({ where: { cardId: { in: cardIds } } }),
      prisma.scan.findMany({
        where: { cardId: { in: cardIds }, timestamp: { gte: daysAgo(30) } },
        select: { timestamp: true, device: true, cardId: true },
        orderBy: { timestamp: "asc" },
      }),
    ]);

    const dailyMap = buildDailyMap(30);
    for (const scan of last30Scans) {
      const day = scan.timestamp.toISOString().split("T")[0];
      dailyMap.set(day, (dailyMap.get(day) || 0) + 1);
    }

    const mobile = last30Scans.filter((s) => s.device === "mobile").length;
    const desktop = last30Scans.filter((s) => s.device === "desktop").length;

    let cardAnalytics: {
      cardId: string;
      status: string;
      totalScans: number;
      scansToday: number;
      scansThisWeek: number;
      dailyBreakdown: { date: string; count: number }[];
      deviceBreakdown: { mobile: number; desktop: number };
    } | null = null;
    if (targetCard) {
      const cardScans = last30Scans.filter((s) => s.cardId === targetCard.id);
      const cardDailyMap = buildDailyMap(30);
      for (const scan of cardScans) {
        const day = scan.timestamp.toISOString().split("T")[0];
        cardDailyMap.set(day, (cardDailyMap.get(day) || 0) + 1);
      }
      const [cardToday, cardWeek, cardTotal] = await Promise.all([
        prisma.scan.count({
          where: { cardId: targetCard.id, timestamp: { gte: todayStart } },
        }),
        prisma.scan.count({
          where: { cardId: targetCard.id, timestamp: { gte: weekStart } },
        }),
        prisma.scan.count({ where: { cardId: targetCard.id } }),
      ]);
      const cardMobile = cardScans.filter((s) => s.device === "mobile").length;
      const cardDesktop = cardScans.filter((s) => s.device === "desktop").length;

      cardAnalytics = {
        cardId: targetCard.cardId,
        status: targetCard.status,
        totalScans: cardTotal,
        scansToday: cardToday,
        scansThisWeek: cardWeek,
        dailyBreakdown: Array.from(cardDailyMap.entries()).map(([date, count]) => ({
          date,
          count,
        })),
        deviceBreakdown: { mobile: cardMobile, desktop: cardDesktop },
      };
    }

    const cardsWithToday = await Promise.all(
      cards.map(async (card) => {
        const scansToday = await prisma.scan.count({
          where: { cardId: card.id, timestamp: { gte: todayStart } },
        });
        return {
          cardId: card.cardId,
          status: card.status,
          totalScans: card._count.scans,
          scansToday,
        };
      }),
    );

    return {
      cards: cardsWithToday,
      summary: { today, week, total },
      dailyBreakdown: Array.from(dailyMap.entries()).map(([date, count]) => ({
        date,
        count,
      })),
      deviceBreakdown: { mobile, desktop },
      analytics: cardAnalytics,
    };
  },

  async userOwnsBusinessCard(userId: string, cardPublicId: string) {
    const card = await prisma.card.findUnique({
      where: { cardId: cardPublicId },
      select: {
        businessProfile: { select: { userId: true } },
      },
    });
    return card?.businessProfile?.userId === userId;
  },
};
