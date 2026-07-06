import { Router } from "express";
import { UserController } from "./user.controller";
import { requireAuth } from "../../middleware/auth.middleware";

export const userRouter = Router();

userRouter.get(
  "/analytics/summary",
  requireAuth,
  UserController.getAnalyticsSummary,
);
userRouter.get("/analytics/daily", requireAuth, UserController.getDailyTrend);
userRouter.get("/scans", requireAuth, UserController.getRecentScans);
userRouter.get("/scans/export", requireAuth, UserController.exportScansCsv);
