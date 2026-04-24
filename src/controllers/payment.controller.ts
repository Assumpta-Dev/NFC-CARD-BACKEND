import { Request, Response, NextFunction } from "express";
import prisma from "../lib/prisma";
import { PaymentStatus } from "@prisma/client";
import { PaymentMethod } from "@prisma/client";

export const PaymentController = {
  /**
   * POST /api/payments/initiate
   * Initiate payment (MoMo / Airtel) — untouched
   */
  async initiatePayment(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.userId;

      const { amount, phone, provider, plan, billingCycle, method } = req.body;

      // Save pending payment
      const payment = await prisma.payment.create({
        data: {
          userId,
          amount,
          phone,
          provider, // MTN or AIRTEL
          method: method ?? PaymentMethod.MTN,
          status: PaymentStatus.PENDING,
          plan,
          billingCycle,
        },
      });

      // 🚨 MTN/Airtel API will be called here in future

      res.status(200).json({
        success: true,
        data: {
          message: "Payment initiated",
          paymentId: payment.id,
        },
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/payments/callback
   * Payment callback (webhook) — untouched
   */
  async handleCallback(req: Request, res: Response, next: NextFunction) {
    try {
      const { paymentId, status } = req.body;

      await prisma.payment.update({
        where: { id: paymentId },
        data: { status },
      });

      res.status(200).json({ success: true });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/payments/my
   * Returns paginated payment history for the authenticated user
   */
  async getMyPayments(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.userId;
      const page = Math.max(Number(req.query.page) || 1, 1);
      const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 100);
      const skip = (page - 1) * limit;

      const [payments, total] = await Promise.all([
        prisma.payment.findMany({
          where: { userId },
          skip,
          take: limit,
          orderBy: { createdAt: "desc" },
        }),
        prisma.payment.count({ where: { userId } }),
      ]);

      res.status(200).json({
        success: true,
        data: payments,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/payments/:id
   * Returns a single payment — only the owner can view it
   */
  async getPaymentById(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.userId;
      const { id } = req.params;

      const payment = await prisma.payment.findUnique({ where: { id } });

      if (!payment) {
        res.status(404).json({ success: false, message: "Payment not found" });
        return;
      }

      if (payment.userId !== userId && req.user!.role !== "ADMIN") {
        res.status(403).json({
          success: false,
          message: "Access denied",
        });
        return;
      }

      res.status(200).json({ success: true, data: payment });
    } catch (error) {
      next(error);
    }
  },
};
