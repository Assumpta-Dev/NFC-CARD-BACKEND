import { Router } from "express";
import { AdminController } from "./admin.controller";
import { requireAuth, requireAdmin } from "../../middleware/auth.middleware";
import {
  validate,
  CreateCardSchema,
  AssignCardSchema,
} from "../../middleware/validate.middleware";

export const adminRouter = Router();

adminRouter.use(requireAuth, requireAdmin);

adminRouter.get("/stats", AdminController.getSystemStats);
adminRouter.get("/cards", AdminController.getAllCards);
adminRouter.post("/cards", validate(CreateCardSchema), AdminController.createCards);
adminRouter.put(
  "/cards/:cardId/assign",
  validate(AssignCardSchema),
  AdminController.assignCardToUser,
);
adminRouter.get("/users/count", AdminController.getUserCount);
adminRouter.get("/users/top", AdminController.getTopUsers);
adminRouter.get("/users/active", AdminController.getActiveUsers);
adminRouter.get("/users", AdminController.getAllUsers);
adminRouter.get("/cards/count", AdminController.getCardCount);
adminRouter.get("/cards/top", AdminController.getTopCards);
adminRouter.get("/cards/active", AdminController.getActiveCards);
adminRouter.get("/scans/count", AdminController.getScanCount);
adminRouter.get("/scans/daily", AdminController.getDailyScanBreakdown);
adminRouter.get("/scans/export", AdminController.exportScansCsv);
adminRouter.get(
  "/analytics/daily-scans",
  AdminController.getDailyScanBreakdown,
);
adminRouter.get("/analytics/top-cards", AdminController.getTopCards);
adminRouter.get("/analytics/top-users", AdminController.getTopUsers);
adminRouter.get("/businesses", AdminController.getAllBusinesses);
adminRouter.get("/businesses/:id", AdminController.getBusinessById);
adminRouter.get("/payments", AdminController.getAllPayments);
