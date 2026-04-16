// ===========================================================
// USER CONTROLLER
// ===========================================================

import { Request, Response, NextFunction } from "express";
import { ScanService } from "../services/scan.service";

export const UserController = {
  /**
   * GET /api/user/analytics/summary
   * PROTECTED — returns the authenticated user's scan summary
   */
  async getAnalyticsSummary(req: Request, res: Response, next: NextFunction) {
    try {
      const summary = await ScanService.getUserScanSummary(req.user!.userId);
      res.status(200).json({ success: true, data: summary });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/user/analytics/daily
   * PROTECTED — returns the user's daily scan activity for the requested range
   */
  async getDailyTrend(req: Request, res: Response, next: NextFunction) {
    try {
      const range = (req.query.range as string) || "7d";
      const rangeDays =
        range === "7d" ? 7 : range === "30d" ? 30 : range === "all" ? 365 : 7;
      const dailyTrend = await ScanService.getUserDailyTrend(
        req.user!.userId,
        rangeDays,
      );
      res.status(200).json({ success: true, data: dailyTrend });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/user/scans
   * PROTECTED — returns recent scans for the authenticated user's cards
   */
  async getRecentScans(req: Request, res: Response, next: NextFunction) {
    try {
      const limit = Math.min(Number(req.query.limit) || 50, 100);
      const after =
        typeof req.query.after === "string" ? req.query.after : undefined;
      const scans = await ScanService.getUserRecentScans(
        req.user!.userId,
        limit,
        after,
      );
      res.status(200).json({ success: true, data: scans });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/user/scans/export
   * PROTECTED — exports the authenticated user's scans as CSV
   */
  async exportScansCsv(req: Request, res: Response, next: NextFunction) {
    try {
      const csv = await ScanService.exportUserScansCsv(req.user!.userId);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="user_scans_${new Date().toISOString().slice(0, 10)}.csv"`,
      );
      res.send(csv);
    } catch (error) {
      next(error);
    }
  },
};
