import { Router } from "express";
import { MenuController } from "./menu.controller";
import { requireAuth, requireBusiness } from "../../middleware/auth.middleware";
import { uploadPhoto } from "../../middleware/upload.middleware";

export const menuRouter = Router();

menuRouter.post("/", requireAuth, MenuController.createMenu);
menuRouter.get("/", requireAuth, requireBusiness, MenuController.getMenus);
menuRouter.post(
  "/:menuId/items",
  requireAuth,
  requireBusiness,
  uploadPhoto,
  MenuController.addMenuItem,
);
menuRouter.patch(
  "/:menuId/items/:itemId",
  requireAuth,
  requireBusiness,
  MenuController.updateMenuItem,
);
menuRouter.delete(
  "/:menuId/items/:itemId",
  requireAuth,
  requireBusiness,
  MenuController.deleteMenuItem,
);
