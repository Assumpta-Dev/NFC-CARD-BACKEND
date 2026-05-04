// ===========================================================
// PAYMENT CONTROLLER
// ===========================================================
// Handles all payment-related HTTP requests.
// Uses Paypack (paypack.rw) as the payment gateway for Rwanda
// MTN MoMo and Airtel Money payments.
//
// Endpoints:
//   POST /api/payments/initiate  — start a payment, sends push to phone
//   POST /api/payments/webhook   — Paypack calls this when payment completes
//   GET  /api/payments/:id/status — manual status poll (fallback)
//   GET  /api/payments/my        — user's payment history
//   GET  /api/payments/:id       — single payment detail
// ===========================================================

import { Request, Response, NextFunction } from "express";
import prisma from "../lib/prisma";
import { PaymentStatus, PaymentMethod } from "@prisma/client";
import { cashin, getTransaction } from "../services/paypack.service";

export const PaymentController = {
  // ===========================================================
  // POST /api/payments/initiate
  // ===========================================================
  // Creates a pending payment record then calls Paypack cashin.
  // Paypack sends a USSD push to the customer's phone.
  // Customer enters their PIN — Paypack calls our webhook with result.
  async initiatePayment(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.userId;
      const { amount, phone, plan, billingCycle, method } = req.body;

      // Save payment as PENDING before calling Paypack
      // so we have a record even if something goes wrong mid-flight
      const payment = await prisma.payment.create({
        data: {
          userId,
          amount,
          phone,
          provider: method ?? "MTN",
          method: method === "AIRTEL" ? PaymentMethod.AIRTEL : PaymentMethod.MTN,
          status: PaymentStatus.PENDING,
          plan,
          billingCycle,
        },
      });

      // Send payment request to customer's phone via Paypack
      const ref = await cashin(phone, amount);

      // Store the Paypack reference so we can match it in the webhook
      await prisma.payment.update({
        where: { id: payment.id },
        data: { reference: ref },
      });

      res.status(200).json({
        success: true,
        data: {
          message: "Payment request sent to your phone. Please approve it.",
          paymentId: payment.id,
          reference: ref,
        },
      });
    } catch (error) {
      next(error);
    }
  },

  // ===========================================================
  // POST /api/payments/webhook
  // ===========================================================
  // Paypack calls this URL automatically when a transaction
  // status changes (successful, failed, pending).
  // Must respond with 200 immediately — Paypack retries if it doesn't.
  //
  // Webhook URL to register on Paypack dashboard:
  //   https://<your-backend-domain>/api/payments/webhook
  async handleWebhook(req: Request, res: Response, next: NextFunction) {
    try {
      const { ref, status } = req.body;

      // Respond 200 immediately so Paypack doesn't retry
      res.status(200).json({ success: true });

      if (!ref) return;

      // Find the payment by Paypack reference
      const payment = await prisma.payment.findFirst({
        where: { reference: ref },
      });

      if (!payment) return;

      // Map Paypack status to our internal PaymentStatus enum
      const mapped =
        status === "successful"
          ? PaymentStatus.SUCCESS
          : status === "failed"
            ? PaymentStatus.FAILED
            : PaymentStatus.PENDING;

      await prisma.payment.update({
        where: { id: payment.id },
        data: { status: mapped },
      });
    } catch (error) {
      next(error);
    }
  },

  // ===========================================================
  // GET /api/payments/:id/status
  // ===========================================================
  // Manual status poll — frontend can call this every few seconds
  // as a fallback if the webhook hasn't fired yet.
  async checkStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.userId;
      const { id } = req.params;

      const payment = await prisma.payment.findUnique({ where: { id } });

      if (!payment) {
        res.status(404).json({ success: false, message: "Payment not found" });
        return;
      }

      if (payment.userId !== userId && req.user!.role !== "ADMIN") {
        res.status(403).json({ success: false, message: "Access denied" });
        return;
      }

      if (!payment.reference) {
        res.status(400).json({ success: false, message: "No reference for this payment" });
        return;
      }

      // Fetch latest status from Paypack
      const tx = await getTransaction(payment.reference);

      const mapped =
        tx.status === "successful"
          ? PaymentStatus.SUCCESS
          : tx.status === "failed"
            ? PaymentStatus.FAILED
            : PaymentStatus.PENDING;

      // Update DB if status changed
      if (mapped !== payment.status) {
        await prisma.payment.update({ where: { id }, data: { status: mapped } });
      }

      res.status(200).json({ success: true, data: { status: tx.status } });
    } catch (error) {
      next(error);
    }
  },

  // ===========================================================
  // GET /api/payments/my
  // ===========================================================
  // Returns paginated payment history for the authenticated user.
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

  // ===========================================================
  // GET /api/payments/:id
  // ===========================================================
  // Returns a single payment — only the owner or admin can view it.
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
        res.status(403).json({ success: false, message: "Access denied" });
        return;
      }

      res.status(200).json({ success: true, data: payment });
    } catch (error) {
      next(error);
    }
  },
};
