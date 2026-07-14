import { Router } from "express";
import { StaffController } from "./staff.controller";
import { requireAuth, requireBusiness } from "../../middleware/auth.middleware";

export const staffRouter = Router();

staffRouter.get("/me", requireAuth, StaffController.me);
staffRouter.get("/", requireAuth, requireBusiness, StaffController.list);
staffRouter.post("/", requireAuth, requireBusiness, StaffController.create);
staffRouter.patch("/:id/active", requireAuth, requireBusiness, StaffController.setActive);
staffRouter.delete("/:id", requireAuth, requireBusiness, StaffController.remove);
