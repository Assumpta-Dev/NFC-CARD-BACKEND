// ===========================================================
// ORDER CONTROLLER
// ===========================================================
// Handles food orders placed by customers on business cards.
//
// Public endpoints (no auth — customers scan a card):
//   POST /api/orders              — place a new order
//   POST /api/orders/:id/txid     — submit MoMo TxId after paying
//   GET  /api/orders/:id/status   — poll order status (auto-refresh)
//
// Business endpoints (auth required — business owner):
//   GET  /api/orders/business     — list all orders for my business
//   POST /api/orders/:id/confirm  — confirm payment (mark as PAID)
//   POST /api/orders/:id/reject   — reject order (wrong TxId/amount)
// ===========================================================

import { Request, Response, NextFunction } from "express";
import prisma from "../lib/prisma";

export const OrderController = {
  // ===========================================================
  // POST /api/orders
  // PUBLIC — customer places an order from the business card page
  // Body: { businessId, customerName, phone, items: [{id, name, price, qty, imageUrl}] }
  // ===========================================================
  async placeOrder(req: Request, res: Response, next: NextFunction) {
    try {
      const { businessId, customerName, phone, items } = req.body;

      if (!businessId || !customerName?.trim() || !phone?.trim() || !items?.length) {
        res.status(400).json({ success: false, message: "businessId, customerName, phone and items are required" });
        return;
      }

      // Calculate total from items snapshot — never trust client total
      const total = (items as { price: number; qty: number }[]).reduce(
        (sum, item) => sum + item.price * item.qty,
        0,
      );

      const order = await prisma.order.create({
        data: {
          businessId,
          customerName: customerName.trim(),
          phone: phone.trim(),
          total,
          items, // stored as JSON snapshot
          status: "PENDING",
        },
      });

      res.status(201).json({ success: true, data: order });
    } catch (error) {
      next(error);
    }
  },

  // ===========================================================
  // POST /api/orders/:id/txid
  // PUBLIC — customer submits their MoMo TxId after paying
  // Body: { txId }
  // ===========================================================
  async submitTxId(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { txId } = req.body;

      if (!txId?.trim()) {
        res.status(400).json({ success: false, message: "Transaction ID is required" });
        return;
      }

      const order = await prisma.order.findUnique({ where: { id } });
      if (!order) {
        res.status(404).json({ success: false, message: "Order not found" });
        return;
      }

      if (order.status !== "PENDING") {
        res.status(400).json({ success: false, message: "Order is no longer pending" });
        return;
      }

      const updated = await prisma.order.update({
        where: { id },
        data: { txId: txId.trim(), status: "WAITING_VERIFICATION" },
      });

      res.status(200).json({ success: true, data: updated });
    } catch (error) {
      next(error);
    }
  },

  // ===========================================================
  // GET /api/orders/:id/status
  // PUBLIC — customer polls this to see if business confirmed
  // ===========================================================
  async getOrderStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      const order = await prisma.order.findUnique({
        where: { id },
        include: { business: { select: { name: true } } },
      });

      if (!order) {
        res.status(404).json({ success: false, message: "Order not found" });
        return;
      }

      res.status(200).json({ success: true, data: order });
    } catch (error) {
      next(error);
    }
  },

  // ===========================================================
  // GET /api/orders/business
  // PROTECTED — business owner sees all their incoming orders
  // ===========================================================
  async getBusinessOrders(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.userId;

      const business = await prisma.businessProfile.findUnique({
        where: { userId },
        select: { id: true },
      });

      if (!business) {
        res.status(404).json({ success: false, message: "Business profile not found" });
        return;
      }

      const page = Math.max(Number(req.query.page) || 1, 1);
      const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
      const skip = (page - 1) * limit;

      const [orders, total] = await Promise.all([
        prisma.order.findMany({
          where: { businessId: business.id },
          orderBy: { createdAt: "desc" },
          skip,
          take: limit,
        }),
        prisma.order.count({ where: { businessId: business.id } }),
      ]);

      res.status(200).json({
        success: true,
        data: orders,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      });
    } catch (error) {
      next(error);
    }
  },

  // ===========================================================
  // GET /api/orders/business/export
  // PROTECTED — business owner downloads all orders as CSV
  // ===========================================================
  async exportOrdersCsv(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.userId;

      const business = await prisma.businessProfile.findUnique({
        where: { userId },
        select: { id: true, name: true },
      });

      if (!business) {
        res.status(404).json({ success: false, message: "Business profile not found" });
        return;
      }

      const orders = await prisma.order.findMany({
        where: { businessId: business.id },
        orderBy: { createdAt: "desc" },
      });

      const rows = [
        ["Order ID", "Customer", "Phone", "Items", "Total (RWF)", "Status", "TxId", "Date"].join(","),
        ...orders.map((o) => {
          const items = (o.items as any[])
            .map((i: any) => `${i.name} x${i.qty}`)
            .join(" | ");
          return [
            o.id.slice(-8).toUpperCase(),
            `"${o.customerName.replace(/"/g, '""')}"`,
            o.phone,
            `"${items.replace(/"/g, '""')}"`,
            o.total,
            o.status,
            o.txId ?? "",
            new Date(o.createdAt).toLocaleString(),
          ].join(",");
        }),
      ].join("\n");

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="orders-${business.name.replace(/\s+/g, "-")}.csv"`);
      res.status(200).send(rows);
    } catch (error) {
      next(error);
    }
  },

  // ===========================================================
  // POST /api/orders/:id/confirm
  // PROTECTED — business owner confirms payment after verifying TxId
  // ===========================================================
  async confirmOrder(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.userId;
      const { id } = req.params;

      const order = await prisma.order.findUnique({
        where: { id },
        include: { business: { select: { userId: true } } },
      });

      if (!order) {
        res.status(404).json({ success: false, message: "Order not found" });
        return;
      }

      // Only the business owner can confirm
      if (order.business.userId !== userId) {
        res.status(403).json({ success: false, message: "Access denied" });
        return;
      }

      const updated = await prisma.order.update({
        where: { id },
        data: { status: "PAID" },
      });

      res.status(200).json({ success: true, data: updated });
    } catch (error) {
      next(error);
    }
  },

  // ===========================================================
  // POST /api/orders/:id/reject
  // PROTECTED — business owner rejects order (wrong TxId or amount)
  // ===========================================================
  async rejectOrder(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.userId;
      const { id } = req.params;

      const order = await prisma.order.findUnique({
        where: { id },
        include: { business: { select: { userId: true } } },
      });

      if (!order) {
        res.status(404).json({ success: false, message: "Order not found" });
        return;
      }

      if (order.business.userId !== userId) {
        res.status(403).json({ success: false, message: "Access denied" });
        return;
      }

      const updated = await prisma.order.update({
        where: { id },
        data: { status: "REJECTED" },
      });

      res.status(200).json({ success: true, data: updated });
    } catch (error) {
      next(error);
    }
  },
};
