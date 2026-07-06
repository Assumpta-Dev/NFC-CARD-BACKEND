import { Request, Response, NextFunction } from "express";
import { CardService } from "../../services/card.service";
import { ScanService } from "../../services/scan.service";
import { AppError } from "../../middleware/error.middleware";
import prisma from "../../lib/prisma";

export const AdminController = {
  async createCards(_req: Request, res: Response, next: NextFunction) {
    try {
      const { count = 1 } = _req.body;
      const cards = await CardService.createCards(count);
      res.status(201).json({
        success: true,
        data: cards,
        message: `${cards.length} card(s) created successfully`,
      });
    } catch (error) {
      next(error);
    }
  },

  async getAllCards(_req: Request, res: Response, next: NextFunction) {
    try {
      const cards = await CardService.getAllCards();
      res.status(200).json({ success: true, data: cards });
    } catch (error) {
      next(error);
    }
  },

  async getUserCount(_req: Request, res: Response, next: NextFunction) {
    try {
      const result = await prisma.$queryRawUnsafe<[{ count: bigint }]>(`SELECT COUNT(*)::bigint as count FROM users`);
      const count = Number(result[0].count);
      res.status(200).json({ success: true, data: { count } });
    } catch (error) {
      next(error);
    }
  },

  async getCardCount(_req: Request, res: Response, next: NextFunction) {
    try {
      const count = await prisma.card.count();
      res.status(200).json({ success: true, data: { count } });
    } catch (error) {
      next(error);
    }
  },

  async getScanCount(req: Request, res: Response, next: NextFunction) {
    try {
      const range =
        typeof req.query.range === "string" ? req.query.range : "30d";
      const days = parseRangeQuery(range, 30);
      const count = await ScanService.getScanCount(days);
      res.status(200).json({ success: true, data: { count } });
    } catch (error) {
      next(error);
    }
  },

  async getActiveUsers(req: Request, res: Response, next: NextFunction) {
    try {
      const range =
        typeof req.query.range === "string" ? req.query.range : "30d";
      const days = parseRangeQuery(range, 30);
      const count = await ScanService.getActiveUserCount(days);
      res.status(200).json({ success: true, data: { count } });
    } catch (error) {
      next(error);
    }
  },

  async getActiveCards(req: Request, res: Response, next: NextFunction) {
    try {
      const range =
        typeof req.query.range === "string" ? req.query.range : "30d";
      const days = parseRangeQuery(range, 30);
      const count = await ScanService.getActiveCardCount(days);
      res.status(200).json({ success: true, data: { count } });
    } catch (error) {
      next(error);
    }
  },

  async getDailyScanBreakdown(req: Request, res: Response, next: NextFunction) {
    try {
      const range =
        typeof req.query.range === "string" ? req.query.range : "7d";
      const days = parseRangeQuery(range, 7);
      const dailyScans = await ScanService.getDailyScanBreakdown(days);
      res.status(200).json({ success: true, data: dailyScans });
    } catch (error) {
      next(error);
    }
  },

  async getTopCards(req: Request, res: Response, next: NextFunction) {
    try {
      const limit = Math.min(Number(req.query.limit) || 5, 50);
      const range =
        typeof req.query.range === "string" ? req.query.range : "30d";
      const days = parseRangeQuery(range, 30);
      const cards = await ScanService.getTopCards(days, limit);
      res.status(200).json({ success: true, data: cards });
    } catch (error) {
      next(error);
    }
  },

  async getTopUsers(req: Request, res: Response, next: NextFunction) {
    try {
      const limit = Math.min(Number(req.query.limit) || 5, 50);
      const range =
        typeof req.query.range === "string" ? req.query.range : "30d";
      const days = parseRangeQuery(range, 30);
      const users = await ScanService.getTopUsers(days, limit);
      res.status(200).json({ success: true, data: users });
    } catch (error) {
      next(error);
    }
  },

  async exportScansCsv(_req: Request, res: Response, next: NextFunction) {
    try {
      const csv = await ScanService.exportAllScansCsv();
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="admin_scans_${new Date().toISOString().slice(0, 10)}.csv"`,
      );
      res.send(csv);
    } catch (error) {
      next(error);
    }
  },

  async assignCardToUser(req: Request, res: Response, next: NextFunction) {
    try {
      const { cardId } = req.params;
      const { userId } = req.body;
      const rows = await prisma.$queryRawUnsafe<any[]>(
        `SELECT u.id, u.role, bp.id AS "businessProfileId"
         FROM users u
         LEFT JOIN business_profiles bp ON bp."userId" = u.id
         WHERE u.id = $1 LIMIT 1`,
        userId
      );
      const assignee = rows[0] ? {
        id: rows[0].id,
        role: rows[0].role,
        businessProfile: rows[0].businessProfileId ? { id: rows[0].businessProfileId } : null,
      } : null;

      if (!assignee) {
        throw new AppError(404, "User not found");
      }

      const card = await CardService.activateCard(cardId, userId, {
        businessProfileId:
          assignee.role === "BUSINESS" ? assignee.businessProfile?.id : undefined,
      });
      res.status(200).json({
        success: true,
        data: card,
        message: `Card ${cardId} assigned to user ${userId}`,
      });
    } catch (error) {
      next(error);
    }
  },

  async getAllUsers(_req: Request, res: Response, next: NextFunction) {
    try {
      const page = Math.max(Number(_req.query.page) || 1, 1);
      const size = Math.min(Math.max(Number(_req.query.size) || 25, 1), 100);
      const offset = (page - 1) * size;

      const [rows, countResult] = await Promise.all([
        prisma.$queryRawUnsafe<any[]>(
          `SELECT u.id, u.name, u.email, u.role, u."createdAt",
                  COUNT(c.id)::int AS "cardCount"
           FROM users u
           LEFT JOIN cards c ON c."userId" = u.id
           GROUP BY u.id
           ORDER BY u."createdAt" DESC
           LIMIT $1 OFFSET $2`,
          size, offset
        ),
        prisma.$queryRawUnsafe<[{ count: bigint }]>(`SELECT COUNT(*)::bigint as count FROM users`),
      ]);

      const users = rows.map(r => ({
        id: r.id,
        name: r.name,
        email: r.email,
        role: r.role,
        createdAt: r.createdAt,
        _count: { cards: r.cardCount },
      }));

      res.status(200).json({
        success: true,
        data: {
          users,
          total: Number(countResult[0].count),
          page,
          size,
        },
      });
    } catch (error) {
      next(error);
    }
  },

  async getSystemStats(_req: Request, res: Response, next: NextFunction) {
    try {
      const [totalUsers, totalCards, totalScans, activeCards] =
        await Promise.all([
          prisma.$queryRawUnsafe<[{ count: bigint }]>(`SELECT COUNT(*)::bigint as count FROM users`).then(r => Number(r[0].count)),
          prisma.card.count(),
          prisma.scan.count(),
          prisma.card.count({ where: { status: "ACTIVE" } }),
        ]);

      res.status(200).json({
        success: true,
        data: { totalUsers, totalCards, totalScans, activeCards },
      });
    } catch (error) {
      next(error);
    }
  },

  async getAllBusinesses(_req: Request, res: Response, next: NextFunction) {
    try {
      const page = Math.max(Number(_req.query.page) || 1, 1);
      const size = Math.min(Math.max(Number(_req.query.size) || 25, 1), 100);
      const skip = (page - 1) * size;

      const [businesses, total] = await Promise.all([
        prisma.businessProfile.findMany({
          skip,
          take: size,
          orderBy: { createdAt: "desc" },
          include: {
            user: {
              select: { id: true, name: true, email: true },
            },
            cards: {
              select: { id: true, cardId: true, status: true },
            },
            _count: { select: { menus: true } },
          },
        }),
        prisma.businessProfile.count(),
      ]);

      res.status(200).json({
        success: true,
        data: { businesses, total, page, size },
      });
    } catch (error) {
      next(error);
    }
  },

  async getBusinessById(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      const business = await prisma.businessProfile.findUnique({
        where: { id },
        include: {
          user: {
            select: { id: true, name: true, email: true },
          },
          menus: {
            include: {
              items: { orderBy: { createdAt: "desc" } },
            },
            orderBy: { createdAt: "asc" },
          },  
          cards: {
            select: {
              id: true,
              cardId: true,
              status: true,
              createdAt: true,
              updatedAt: true,
              _count: { select: { scans: true } },
            },
          },
        },

      });

      if (!business) {
        res.status(404).json({ success: false, message: "Business not found" });
        return;
      }

      res.status(200).json({ success: true, data: business });
    } catch (error) {
      next(error);
    }
  },

  async getAllPayments(_req: Request, res: Response, next: NextFunction) {
    try {
      const page = Math.max(Number(_req.query.page) || 1, 1);
      const size = Math.min(Math.max(Number(_req.query.size) || 25, 1), 100);
      const skip = (page - 1) * size;

      const statusFilter = _req.query.status as string | undefined;

      const where = statusFilter ? { status: statusFilter as any } : {};

      const [payments, total] = await Promise.all([
        prisma.payment.findMany({
          where,
          skip,
          take: size,
          orderBy: { createdAt: "desc" },
          include: {
            user: {
              select: { id: true, name: true, email: true },
            },
          },
        }),
        prisma.payment.count({ where }),
      ]);

      res.status(200).json({
        success: true,
        data: { payments, total, page, size },
      });
    } catch (error) {
      next(error);
    }
  },
};

function parseRangeQuery(range: string, fallbackDays: number): number {
  const match = /^([0-9]+)d$/i.exec(range.trim());
  if (match) {
    return Number(match[1]);
  }
  const parsed = Number(range);
  if (!Number.isNaN(parsed) && parsed > 0) {
    return parsed;
  }
  return fallbackDays;
}

