import { Router } from "express";
import { CardController } from "./card.controller";

export const publicCardRouter = Router();

publicCardRouter.get("/:cardId", CardController.getPublicCard);
publicCardRouter.get("/:cardId/vcard", CardController.downloadVCard);
