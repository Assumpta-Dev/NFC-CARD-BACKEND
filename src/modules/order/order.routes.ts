import { Router } from "express";
import { OrderController } from "./order.controller";
import { requireAuth, requireBusinessOrStaff } from "../../middleware/auth.middleware";

export const orderRouter = Router();

orderRouter.post("/", OrderController.placeOrder);
orderRouter.get("/favorites", OrderController.getFavorite);
orderRouter.get("/business", requireAuth, requireBusinessOrStaff, OrderController.getBusinessOrders);
orderRouter.get(
  "/business/export",
  requireAuth,
  requireBusinessOrStaff,
  OrderController.exportOrdersCsv,
);
orderRouter.post("/:id/txid", OrderController.submitTxId);
orderRouter.get("/:id/status", OrderController.getOrderStatus);
orderRouter.get(
  "/:id/events",
  requireAuth,
  requireBusinessOrStaff,
  OrderController.getOrderEvents,
);
orderRouter.post("/:id/confirm", requireAuth, requireBusinessOrStaff, OrderController.confirmOrder);
orderRouter.post("/:id/reject", requireAuth, requireBusinessOrStaff, OrderController.rejectOrder);
orderRouter.patch(
  "/:id/prep-status",
  requireAuth,
  requireBusinessOrStaff,
  OrderController.updatePrepStatus,
);
orderRouter.patch(
  "/:id/line-prep",
  requireAuth,
  requireBusinessOrStaff,
  OrderController.updateLinePrep,
);
orderRouter.delete("/:id", requireAuth, requireBusinessOrStaff, OrderController.deleteOrder);
