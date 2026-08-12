import { Router } from "express";
import { BusinessController } from "./business.controller";
import { requireAuth, requireBusiness } from "../../middleware/auth.middleware";
import { uploadPhoto } from "../../middleware/upload.middleware";

export const businessRouter = Router();

businessRouter.get(
  "/analytics/scans",
  requireAuth,
  requireBusiness,
  BusinessController.getBusinessScanAnalytics,
);
businessRouter.get(
  "/analytics",
  requireAuth,
  requireBusiness,
  BusinessController.getBusinessAnalytics,
);
businessRouter.post(
  "/",
  requireAuth,
  requireBusiness,
  uploadPhoto,
  BusinessController.upsertBusinessProfile,
);
businessRouter.get(
  "/",
  requireAuth,
  requireBusiness,
  BusinessController.getMyBusiness,
);
businessRouter.get(
  "/inventory/reports/overview",
  requireAuth,
  requireBusiness,
  BusinessController.getInventoryOverviewReport,
);
businessRouter.get(
  "/inventory/resources",
  requireAuth,
  requireBusiness,
  BusinessController.getInventoryResources,
);
businessRouter.post(
  "/inventory/resources",
  requireAuth,
  requireBusiness,
  BusinessController.createInventoryResource,
);
businessRouter.patch(
  "/inventory/resources/:resourceId",
  requireAuth,
  requireBusiness,
  BusinessController.updateInventoryResource,
);
businessRouter.delete(
  "/inventory/resources/:resourceId",
  requireAuth,
  requireBusiness,
  BusinessController.deleteInventoryResource,
);
businessRouter.get(
  "/card",
  requireAuth,
  requireBusiness,
  BusinessController.getMyBusinessCard,
);
businessRouter.post(
  "/card",
  requireAuth,
  requireBusiness,
  BusinessController.linkCardToBusiness,
);
