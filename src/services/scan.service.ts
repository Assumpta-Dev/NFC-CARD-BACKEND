// ===========================================================
// SCAN SERVICE
// ===========================================================
// Handles recording scan events and computing analytics.
//
// Performance design choices:
//   - Scan recording is fast: one DB insert per tap/scan
//   - Analytics queries use date-range filters + aggregations
//   - The scans table has a compound index (cardId, timestamp)
//     which makes time-based range queries efficient
//
// In a high-traffic system, scan events could be queued
// (Redis/RabbitMQ) and written in batches to reduce DB load.
// For MVP scale, direct writes are fine.
// ===========================================================

import { ScanAnalytics, DailyScanCount } from "../types";
import logger from "../utils/logger";
import prisma from "../lib/prisma";

export const ScanService = {
  /**
   * Record a scan event when a card is opened via NFC or QR.
   * This is called automatically on every card view — no user action needed.
   *
   * Device type is derived from User-Agent string.
   * IP is stored for approximate geolocation (future feature).
   */
  async recordScan(cardInternalId: string, userAgent?: string, ip?: string) {
    // Determine device type from User-Agent string
    // Simple heuristic: mobile keywords vs everything else
    const device = detectDevice(userAgent);

    try {
      const scan = await prisma.scan.create({
        data: {
          cardId: cardInternalId,
          device,
          ip,
          userAgent,
        },
      });

      logger.info("Scan recorded", { cardId: cardInternalId, device });
      return scan;
    } catch (error) {
      // Scan recording failure should NOT break the card view experience
      // Log the error but don't throw — the card still loads successfully
      logger.error("Failed to record scan", { error, cardId: cardInternalId });
      return null;
    }
  },

  /**
   * Get analytics for a specific card.
   * Returns aggregated stats for the user dashboard:
   *   - Total scans
   *   - Scans today
   *   - Scans this week
   *   - Daily breakdown for the chart (last 30 days)
   *   - Device breakdown (mobile vs desktop)
   */
  async getCardAnalytics(cardInternalId: string): Promise<ScanAnalytics> {
    const now = new Date();

    // Calculate date boundaries for "today" and "this week"
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);

    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - 7); // Last 7 days
    startOfWeek.setHours(0, 0, 0, 0);

    const startOf30Days = new Date(now);
    startOf30Days.setDate(now.getDate() - 30);
    startOf30Days.setHours(0, 0, 0, 0);

    // ----------------------------------------------------------
    // Run all queries in parallel for performance
    // These are independent queries — no need to wait sequentially
    // ----------------------------------------------------------
    const [totalScans, scansToday, scansThisWeek, last30DaysScans] =
      await Promise.all([
        // Total all-time scans
        prisma.scan.count({ where: { cardId: cardInternalId } }),

        // Scans in the last 24 hours
        prisma.scan.count({
          where: { cardId: cardInternalId, timestamp: { gte: startOfToday } },
        }),

        // Scans in the last 7 days
        prisma.scan.count({
          where: { cardId: cardInternalId, timestamp: { gte: startOfWeek } },
        }),

        // All scans in last 30 days (for chart and device breakdown)
        prisma.scan.findMany({
          where: { cardId: cardInternalId, timestamp: { gte: startOf30Days } },
          select: { timestamp: true, device: true },
          orderBy: { timestamp: "asc" },
        }),
      ]);

    // ----------------------------------------------------------
    // Compute daily breakdown from the raw scan records
    // We group by date string "YYYY-MM-DD" and count per day
    // Done in-app (not DB) for simplicity — acceptable at MVP scale
    // ----------------------------------------------------------
    const dailyMap = new Map<string, number>();

    // Pre-fill the last 30 days with 0 so the chart shows empty days too
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      dailyMap.set(d.toISOString().split("T")[0], 0);
    }

    // Count scans per day
    for (const scan of last30DaysScans) {
      const day = scan.timestamp.toISOString().split("T")[0];
      dailyMap.set(day, (dailyMap.get(day) || 0) + 1);
    }

    const dailyBreakdown: DailyScanCount[] = Array.from(dailyMap.entries()).map(
      ([date, count]) => ({ date, count }),
    );

    // Device breakdown
    const mobileCount = last30DaysScans.filter(
      (s) => s.device === "mobile",
    ).length;
    const desktopCount = last30DaysScans.filter(
      (s) => s.device === "desktop",
    ).length;

    return {
      totalScans,
      scansToday,
      scansThisWeek,
      dailyBreakdown,
      deviceBreakdown: { mobile: mobileCount, desktop: desktopCount },
    };
  },

  async getScanCount(rangeDays: number) {
    const startDate = getRangeStart(rangeDays);
    return prisma.scan.count({ where: { timestamp: { gte: startDate } } });
  },

  async getActiveUserCount(rangeDays: number) {
    const startDate = getRangeStart(rangeDays);
    return prisma.user.count({
      where: {
        cards: {
          some: {
            scans: { some: { timestamp: { gte: startDate } } },
          },
        },
      },
    });
  },

  async getActiveCardCount(rangeDays: number) {
    const startDate = getRangeStart(rangeDays);
    return prisma.card.count({
      where: {
        scans: { some: { timestamp: { gte: startDate } } },
      },
    });
  },

  async getDailyScanBreakdown(rangeDays: number) {
    const startDate = getRangeStart(rangeDays);
    const scans = await prisma.scan.findMany({
      where: { timestamp: { gte: startDate } },
      select: { timestamp: true },
      orderBy: { timestamp: "asc" },
    });
    return buildDailyBreakdown(scans, rangeDays);
  },

  async getTopCards(rangeDays: number, limit: number) {
    const startDate = getRangeStart(rangeDays);
    const groups = await prisma.scan.groupBy({
      by: ["cardId"],
      where: { timestamp: { gte: startDate } },
      _count: { cardId: true },
      orderBy: { _count: { cardId: "desc" } },
      take: limit,
    });

    const cards = await prisma.card.findMany({
      where: { id: { in: groups.map((group) => group.cardId) } },
      select: {
        id: true,
        cardId: true,
        user: { select: { id: true, name: true, email: true } },
      },
    });

    return groups.map((group) => {
      const card = cards.find((c) => c.id === group.cardId);
      return {
        cardId: card?.cardId || "unknown",
        scans: group._count.cardId,
        owner: card?.user
          ? { id: card.user.id, name: card.user.name, email: card.user.email }
          : null,
      };
    });
  },

  async getTopUsers(rangeDays: number, limit: number) {
    const startDate = getRangeStart(rangeDays);
    const scans = await prisma.scan.findMany({
      where: { timestamp: { gte: startDate } },
      select: { card: { select: { userId: true } } },
    });

    const totals = new Map<string, number>();
    for (const scan of scans) {
      const userId = scan.card.userId;
      if (!userId) continue;
      totals.set(userId, (totals.get(userId) || 0) + 1);
    }

    const sortedUsers = Array.from(totals.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit);

    const users = await prisma.user.findMany({
      where: { id: { in: sortedUsers.map(([userId]) => userId) } },
      select: { id: true, name: true, email: true },
    });

    return sortedUsers.map(([userId, scanCount]) => {
      const user = users.find((u) => u.id === userId);
      return {
        userId,
        scans: scanCount,
        name: user?.name ?? null,
        email: user?.email ?? null,
      };
    });
  },

  async getUserScanSummary(userId: string) {
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);

    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - 7);
    startOfWeek.setHours(0, 0, 0, 0);

    const [today, week, total] = await Promise.all([
      prisma.scan.count({
        where: { card: { userId }, timestamp: { gte: startOfToday } },
      }),
      prisma.scan.count({
        where: { card: { userId }, timestamp: { gte: startOfWeek } },
      }),
      prisma.scan.count({ where: { card: { userId } } }),
    ]);

    return { today, week, total };
  },

  async getUserDailyTrend(userId: string, rangeDays: number) {
    const startDate = getRangeStart(rangeDays);
    const scans = await prisma.scan.findMany({
      where: { card: { userId }, timestamp: { gte: startDate } },
      select: { timestamp: true },
      orderBy: { timestamp: "asc" },
    });
    return buildDailyBreakdown(scans, rangeDays);
  },

  async getUserRecentScans(userId: string, limit: number, after?: string) {
    const where: {
      card: { userId: string };
      timestamp?: { lt: Date };
    } = { card: { userId } };

    if (after) {
      const afterDate = new Date(after);
      if (!Number.isNaN(afterDate.getTime())) {
        where.timestamp = { lt: afterDate };
      }
    }

    return prisma.scan.findMany({
      where,
      include: { card: { select: { cardId: true } } },
      orderBy: { timestamp: "desc" },
      take: limit,
    });
  },

  async exportAllScansCsv() {
    const scans = await prisma.scan.findMany({
      include: {
        card: {
          select: { cardId: true, user: { select: { id: true, email: true } } },
        },
      },
      orderBy: { timestamp: "asc" },
    });
    const rows = scans.map((scan) => ({
      cardId: scan.card.cardId,
      userId: scan.card.user?.id || "",
      userEmail: scan.card.user?.email || "",
      timestamp: scan.timestamp.toISOString(),
      device: scan.device || "",
      ip: scan.ip || "",
      userAgent: scan.userAgent || "",
    }));
    return buildCsv(rows, [
      "cardId",
      "userId",
      "userEmail",
      "timestamp",
      "device",
      "ip",
      "userAgent",
    ]);
  },

  async exportUserScansCsv(userId: string) {
    const scans = await prisma.scan.findMany({
      where: { card: { userId } },
      include: { card: { select: { cardId: true } } },
      orderBy: { timestamp: "asc" },
    });
    const rows = scans.map((scan) => ({
      cardId: scan.card.cardId,
      timestamp: scan.timestamp.toISOString(),
      device: scan.device || "",
      ip: scan.ip || "",
      userAgent: scan.userAgent || "",
    }));
    return buildCsv(rows, ["cardId", "timestamp", "device", "ip", "userAgent"]);
  },
};

function getRangeStart(rangeDays: number) {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - rangeDays + 1);
  return start;
}

function buildDailyBreakdown(
  scans: Array<{ timestamp: Date }>,
  rangeDays: number,
) {
  const now = new Date();
  const dailyMap = new Map<string, number>();

  for (let i = rangeDays - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - i);
    dailyMap.set(date.toISOString().split("T")[0], 0);
  }

  for (const scan of scans) {
    const day = scan.timestamp.toISOString().split("T")[0];
    dailyMap.set(day, (dailyMap.get(day) || 0) + 1);
  }

  return Array.from(dailyMap.entries()).map(([date, count]) => ({
    date,
    count,
  }));
}

function buildCsv(rows: Array<Record<string, string>>, headers: string[]) {
  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const lines = [headers.map(escape).join(",")];
  for (const row of rows) {
    lines.push(headers.map((header) => escape(row[header] ?? "")).join(","));
  }
  return lines.join("\n");
}

/**
 * Detects device type from User-Agent string.
 * Returns "mobile" or "desktop".
 * This is intentionally simple — for production, use a UA parsing library.
 */
function detectDevice(userAgent?: string): string {
  if (!userAgent) return "unknown";

  const mobileKeywords =
    /android|iphone|ipad|ipod|blackberry|windows phone|mobile/i;
  return mobileKeywords.test(userAgent) ? "mobile" : "desktop";
}
