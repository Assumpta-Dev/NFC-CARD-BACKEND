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
