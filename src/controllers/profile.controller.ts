// ===========================================================
// PROFILE CONTROLLER
// ===========================================================

import { Request, Response, NextFunction } from "express";
import { ProfileService } from "../services/profile.service";
import { AppError } from "../middleware/error.middleware";

export const ProfileController = {
  /**
   * GET /api/profile
   * PROTECTED — returns the authenticated user's full profile for editing
   */
  async getMyProfile(_req: Request, res: Response, next: NextFunction) {
    try {
      const profile = await ProfileService.getProfile(_req.user!.userId);
      res.status(200).json({ success: true, data: profile });
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/profile/photo
   * PROTECTED — uploads a profile photo to Cloudinary
   * Handled as multipart/form-data with field name 'photo'
   */
  async uploadPhoto(req: Request, res: Response, next: NextFunction) {
    try {
      // multer attaches the file to req.file after upload.middleware runs
      if (!req.file) throw new AppError(400, "No photo file provided");

      const imageUrl = await ProfileService.uploadPhoto(
        req.user!.userId,
        req.file.buffer,
        req.file.mimetype,
      );

      res.status(200).json({
        success: true,
        data: { imageUrl },
        message: "Profile photo uploaded successfully",
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * PUT /api/profile
   * PROTECTED — updates the authenticated user's profile
   * Body is validated by UpdateProfileSchema middleware before reaching here
   */
  async updateMyProfile(_req: Request, res: Response, next: NextFunction) {
    try {
      const profile = await ProfileService.updateProfile(
        _req.user!.userId,
        _req.body,
      );
      res.status(200).json({
        success: true,
        data: profile,
        message: "Profile updated successfully",
      });
    } catch (error) {
      next(error);
    }
  },
};

// ===========================================================
// ADMIN CONTROLLER
// ===========================================================
// Admin routes are protected by both requireAuth and requireAdmin.
// These routes manage the system-level operations.
// ===========================================================

import { CardService } from "../services/card.service";
import { ScanService } from "../services/scan.service";
import prisma from "../lib/prisma";

export const AdminController = {
  /**
   * POST /api/admin/cards
   * ADMIN — creates one or more new physical cards in the system
   */
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

  /**
   * GET /api/admin/cards
   * ADMIN — lists all cards in the system with owner and scan count
   */
  async getAllCards(_req: Request, res: Response, next: NextFunction) {
    try {
      const cards = await CardService.getAllCards();
      res.status(200).json({ success: true, data: cards });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/admin/users/count
   * ADMIN — returns the total number of registered users
   */
  async getUserCount(_req: Request, res: Response, next: NextFunction) {
    try {
      const count = await prisma.user.count();
      res.status(200).json({ success: true, data: { count } });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/admin/cards/count
   * ADMIN — returns the total number of cards in the system
   */
  async getCardCount(_req: Request, res: Response, next: NextFunction) {
    try {
      const count = await prisma.card.count();
      res.status(200).json({ success: true, data: { count } });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/admin/scans/count
   * ADMIN — returns total scan count in the requested range
   */
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

  /**
   * GET /api/admin/users/active
   * ADMIN — returns number of distinct users with scans in the requested range
   */
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

  /**
   * GET /api/admin/cards/active
   * ADMIN — returns number of active cards with scans in the requested range
   */
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

  /**
   * GET /api/admin/analytics/daily-scans
   * ADMIN — returns daily scan counts for the requested range
   */
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

  /**
   * GET /api/admin/analytics/top-cards
   * ADMIN — returns the most scanned cards in the requested range
   */
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

  /**
   * GET /api/admin/analytics/top-users
   * ADMIN — returns the most scanned users in the requested range
   */
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

  /**
   * GET /api/admin/scans/export
   * ADMIN — exports all scan events to CSV
   */
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

  /**
   * PUT /api/admin/cards/:cardId/assign
   * ADMIN — assign a physical card to an existing user
   */
  async assignCardToUser(req: Request, res: Response, next: NextFunction) {
    try {
      const { cardId } = req.params;
      const { userId } = req.body;
      const card = await CardService.activateCard(cardId, userId);
      res.status(200).json({
        success: true,
        data: card,
        message: `Card ${cardId} assigned to user ${userId}`,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/admin/users
   * ADMIN — lists all registered users (without passwords)
   */
  async getAllUsers(_req: Request, res: Response, next: NextFunction) {
    try {
      const page = Math.max(Number(_req.query.page) || 1, 1);
      const size = Math.min(Math.max(Number(_req.query.size) || 25, 1), 100);
      const skip = (page - 1) * size;

      const [users, total] = await Promise.all([
        prisma.user.findMany({
          skip,
          take: size,
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            createdAt: true,
            _count: { select: { cards: true } },
          },
          orderBy: { createdAt: "desc" },
        }),
        prisma.user.count(),
      ]);

      res.status(200).json({
        success: true,
        data: {
          users,
          total,
          page,
          size,
        },
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/admin/stats
   * ADMIN — system-wide statistics for admin dashboard overview
   */
  async getSystemStats(_req: Request, res: Response, next: NextFunction) {
    try {
      const [totalUsers, totalCards, totalScans, activeCards] =
        await Promise.all([
          prisma.user.count(),
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
