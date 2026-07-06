import { Router } from "express";
import { CardController } from "./card.controller";
import { requireAuth } from "../../middleware/auth.middleware";

export const cardRouter = Router();

cardRouter.get("/my", requireAuth, CardController.getMyCards);
cardRouter.get(
  "/:cardId/analytics",
  requireAuth,
  CardController.getCardAnalytics,
);
