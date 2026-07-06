import { Router } from "express";
import { AuthController } from "./auth.controller";
import { CardController } from "../card/card.controller";
import { requireAuth } from "../../middleware/auth.middleware";
import {
  validate,
  RegisterSchema,
  LoginSchema,
  ForgotPasswordSchema,
  ResetPasswordSchema,
} from "../../middleware/validate.middleware";

export const authRouter = Router();

authRouter.post("/register", validate(RegisterSchema), AuthController.register);
authRouter.post(
  "/forgot-password",
  validate(ForgotPasswordSchema),
  AuthController.forgotPassword,
);
authRouter.post(
  "/reset-password",
  validate(ResetPasswordSchema),
  AuthController.resetPassword,
);
authRouter.post("/login", validate(LoginSchema), AuthController.login);
authRouter.get("/me", requireAuth, AuthController.me);

// Legacy public card routes (prefer /api/c/:cardId)
authRouter.get("/:cardId", CardController.getPublicCard);
authRouter.get("/:cardId/vcard", CardController.downloadVCard);
