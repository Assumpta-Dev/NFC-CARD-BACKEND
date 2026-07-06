import { Router } from "express";
import { OrderController } from "./order.controller";
import { requireAuth } from "../../middleware/auth.middleware";

export const orderRouter = Router();

orderRouter.post("/", OrderController.placeOrder);
orderRouter.get("/business", requireAuth, OrderController.getBusinessOrders);
orderRouter.get(
  "/business/export",
  requireAuth,
  OrderController.exportOrdersCsv,
);
orderRouter.post("/:id/txid", OrderController.submitTxId);
orderRouter.get("/:id/status", OrderController.getOrderStatus);
orderRouter.post("/:id/confirm", requireAuth, OrderController.confirmOrder);
orderRouter.post("/:id/reject", requireAuth, OrderController.rejectOrder);
orderRouter.delete("/:id", requireAuth, OrderController.deleteOrder);
