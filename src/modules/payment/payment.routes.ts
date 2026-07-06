import { Router } from "express";
import { PaymentController } from "./payment.controller";
import { requireAuth } from "../../middleware/auth.middleware";

export const paymentRouter = Router();

paymentRouter.post("/initiate", requireAuth, PaymentController.initiatePayment);
paymentRouter.post("/webhook", PaymentController.handleWebhook);
paymentRouter.get("/my", requireAuth, PaymentController.getMyPayments);
paymentRouter.get("/:id/status", requireAuth, PaymentController.checkStatus);
paymentRouter.get("/:id", requireAuth, PaymentController.getPaymentById);
