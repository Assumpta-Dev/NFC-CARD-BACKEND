import { Request, Response, NextFunction } from "express";
import { PrepStatus } from "@prisma/client";
import prisma from "../../lib/prisma";
import {
  BusinessSettings,
  computeEstimatedWaitMinutes,
  isWithinHappyHour,
  parseOrderContext,
} from "../../constants/business";
import {
  deriveOrderPrepFromLines,
  normalizeOrderItems,
  OrderItemSnapshot,
  computeCartHash,
} from "../../constants/order-customization";
import {
  resolveBusinessAccess,
  userCanAccessBusinessOrder,
} from "../../utils/business-access";
import { emitBusinessOrderEvent } from "../../services/order-realtime.service";
import {
  buildGuestWhatsAppRejectLink,
  recordOrderEvent,
  REJECT_REASON_CODES,
  REJECT_REASON_LABELS,
  RejectReasonCode,
} from "../../utils/order-ops";

const PREP_STATUSES = new Set<string>([
  "NONE",
  "RECEIVED",
  "PREPARING",
  "READY",
  "SERVED",
  "CANCELLED",
]);

const LINE_PREP = new Set(["QUEUED", "PREPARING", "READY", "SERVED", "CANCELLED"]);

const DUPLICATE_WINDOW_MS = 2 * 60 * 1000;

function settingsOf(raw: unknown): BusinessSettings {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as BusinessSettings;
  }
  return {};
}

function actorNameFromReq(req: Request): string {
  return req.user?.email ?? req.user?.userId ?? "staff";
}

function itemAllowedForContext(
  availability: string,
  orderContext: string,
  settings: BusinessSettings,
): boolean {
  if (availability === "ALL") return true;
  if (availability === "ROOM_SERVICE") return orderContext === "ROOM";
  if (availability === "DINE_IN") return orderContext === "TABLE" || orderContext === "BAR_SEAT";
  if (availability === "HAPPY_HOUR") return isWithinHappyHour(settings.happyHourWindow);
  return true;
}

async function enrichItemsWithMenuMeta(
  items: OrderItemSnapshot[],
  orderContext: string,
  settings: BusinessSettings,
): Promise<OrderItemSnapshot[]> {
  const ids = [...new Set(items.map((i) => i.id))];
  const menuItems = await prisma.menuItem.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      isSoldOut: true,
      availability: true,
      station: true,
      name: true,
    },
  });
  const byId = new Map(menuItems.map((m) => [m.id, m]));

  return items.map((item) => {
    const meta = byId.get(item.id);
    if (!meta) return { ...item, station: item.station ?? "KITCHEN", linePrepStatus: "QUEUED" };
    if (meta.isSoldOut) {
      throw new Error(`"${meta.name}" is sold out`);
    }
    if (!itemAllowedForContext(meta.availability, orderContext, settings)) {
      throw new Error(`"${meta.name}" is not available for this order type right now`);
    }
    return {
      ...item,
      station: (meta.station === "ALL" ? "KITCHEN" : meta.station) as OrderItemSnapshot["station"],
      linePrepStatus: "QUEUED" as const,
    };
  });
}

export const OrderController = {
  async placeOrder(req: Request, res: Response, next: NextFunction) {
    try {
      const {
        businessId,
        customerName,
        phone,
        items,
        orderContext,
        tableNumber,
        roomNumber,
        notes,
        forceDuplicate,
      } = req.body;

      if (!businessId || !customerName?.trim() || !phone?.trim()) {
        res.status(400).json({
          success: false,
          message: "businessId, customerName, phone and items are required",
        });
        return;
      }

      let normalizedItems;
      try {
        normalizedItems = normalizeOrderItems(items);
      } catch (err) {
        res.status(400).json({
          success: false,
          message: err instanceof Error ? err.message : "Invalid items",
        });
        return;
      }

      const business = await prisma.businessProfile.findUnique({
        where: { id: businessId },
        select: { id: true, settings: true, name: true },
      });
      if (!business) {
        res.status(404).json({ success: false, message: "Business not found" });
        return;
      }

      const settings = settingsOf(business.settings);
      if (settings.busyMode) {
        res.status(423).json({
          success: false,
          message: "Kitchen paused — not accepting orders right now. Please try again later.",
          code: "BUSY_MODE",
        });
        return;
      }

      let context;
      try {
        context = parseOrderContext(orderContext);
      } catch (err) {
        res.status(400).json({
          success: false,
          message: err instanceof Error ? err.message : "Invalid orderContext",
        });
        return;
      }

      const table = typeof tableNumber === "string" ? tableNumber.trim() : "";
      const room = typeof roomNumber === "string" ? roomNumber.trim() : "";

      if ((context === "TABLE" || context === "BAR_SEAT") && !table) {
        res.status(400).json({
          success: false,
          message:
            context === "BAR_SEAT"
              ? "tableNumber (bar seat / stool) is required for bar orders"
              : "tableNumber is required for table orders",
        });
        return;
      }

      if (context === "ROOM" && !room) {
        res.status(400).json({ success: false, message: "roomNumber is required for room orders" });
        return;
      }

      try {
        normalizedItems = await enrichItemsWithMenuMeta(normalizedItems, context, settings);
      } catch (err) {
        res.status(400).json({
          success: false,
          message: err instanceof Error ? err.message : "Item not available",
        });
        return;
      }

      const phoneTrim = phone.trim();
      const cartHash = computeCartHash(phoneTrim, normalizedItems);

      if (!forceDuplicate) {
        const recent = await prisma.order.findFirst({
          where: {
            businessId,
            phone: phoneTrim,
            cartHash,
            createdAt: { gte: new Date(Date.now() - DUPLICATE_WINDOW_MS) },
            status: { not: "REJECTED" },
          },
          orderBy: { createdAt: "desc" },
        });
        if (recent) {
          res.status(409).json({
            success: false,
            code: "DUPLICATE_ORDER",
            message:
              "Looks like you placed the same order in the last 2 minutes. Did you mean to order twice?",
            data: { existingOrderId: recent.id },
          });
          return;
        }
      }

      const total = normalizedItems.reduce((sum, item) => sum + item.price * item.qty, 0);
      const orderNotes =
        typeof notes === "string" && notes.trim() ? notes.trim().slice(0, 1000) : null;
      const estimatedWaitMinutes = computeEstimatedWaitMinutes(settings);

      const order = await prisma.order.create({
        data: {
          businessId,
          customerName: customerName.trim(),
          phone: phoneTrim,
          orderContext: context,
          tableNumber: context === "ROOM" ? null : table || null,
          roomNumber: context === "ROOM" ? room : null,
          notes: orderNotes,
          total,
          items: normalizedItems,
          status: "PENDING",
          prepStatus: "NONE",
          cartHash,
          estimatedWaitMinutes,
        },
      });

      await prisma.guestFavorite.upsert({
        where: {
          businessId_phone: { businessId, phone: phoneTrim },
        },
        create: {
          businessId,
          phone: phoneTrim,
          customerName: customerName.trim(),
          items: normalizedItems,
        },
        update: {
          customerName: customerName.trim(),
          items: normalizedItems,
        },
      });

      await recordOrderEvent({
        orderId: order.id,
        action: "PLACED",
        detail: `Guest ${customerName.trim()} · wait ~${estimatedWaitMinutes} min`,
      });

      emitBusinessOrderEvent(businessId, "order:created", order);
      res.status(201).json({ success: true, data: order });
    } catch (error) {
      next(error);
    }
  },

  async getFavorite(req: Request, res: Response, next: NextFunction) {
    try {
      const businessId = String(req.query.businessId ?? "");
      const phone = String(req.query.phone ?? "").trim();
      if (!businessId || !phone) {
        res.status(400).json({ success: false, message: "businessId and phone are required" });
        return;
      }
      const fav = await prisma.guestFavorite.findUnique({
        where: { businessId_phone: { businessId, phone } },
      });
      res.status(200).json({ success: true, data: fav });
    } catch (error) {
      next(error);
    }
  },

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

      await recordOrderEvent({
        orderId: id,
        action: "TXID_SUBMITTED",
        detail: txId.trim(),
      });

      emitBusinessOrderEvent(updated.businessId, "order:updated", updated);
      res.status(200).json({ success: true, data: updated });
    } catch (error) {
      next(error);
    }
  },

  async getOrderStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      const order = await prisma.order.findUnique({
        where: { id },
        include: {
          business: { select: { name: true, businessType: true, phone: true, settings: true } },
          events: { orderBy: { createdAt: "asc" }, take: 50 },
        },
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

  async getBusinessOrders(req: Request, res: Response, next: NextFunction) {
    try {
      const access = await resolveBusinessAccess(req.user!.userId, req.user!.role);
      if (!access) {
        res.status(404).json({ success: false, message: "Business access not found" });
        return;
      }

      const page = Math.max(Number(req.query.page) || 1, 1);
      const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
      const skip = (page - 1) * limit;
      const station = typeof req.query.station === "string" ? req.query.station.toUpperCase() : null;

      const [orders, total, business] = await Promise.all([
        prisma.order.findMany({
          where: { businessId: access.businessId },
          include: {
            events: { orderBy: { createdAt: "desc" }, take: 8 },
          },
          orderBy: { createdAt: "desc" },
          skip,
          take: limit,
        }),
        prisma.order.count({ where: { businessId: access.businessId } }),
        prisma.businessProfile.findUnique({
          where: { id: access.businessId },
          select: { settings: true },
        }),
      ]);

      let filtered = orders;
      if (station && station !== "ALL") {
        filtered = orders.filter((o) => {
          const items = o.items as OrderItemSnapshot[];
          return items.some((i) => (i.station ?? "KITCHEN") === station);
        });
      }

      res.status(200).json({
        success: true,
        data: filtered,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
        meta: {
          businessId: access.businessId,
          businessName: access.businessName,
          businessType: access.businessType,
          isOwner: access.isOwner,
          staffRole: access.staffRole,
          settings: settingsOf(business?.settings),
          rejectReasons: REJECT_REASON_CODES.map((code) => ({
            code,
            label: REJECT_REASON_LABELS[code],
          })),
        },
      });
    } catch (error) {
      next(error);
    }
  },

  async exportOrdersCsv(req: Request, res: Response, next: NextFunction) {
    try {
      const access = await resolveBusinessAccess(req.user!.userId, req.user!.role);
      if (!access) {
        res.status(404).json({ success: false, message: "Business access not found" });
        return;
      }

      const orders = await prisma.order.findMany({
        where: { businessId: access.businessId },
        orderBy: { createdAt: "desc" },
      });

      const rows = [
        [
          "Order ID",
          "Customer",
          "Phone",
          "Context",
          "Table/Room",
          "Items",
          "Item Notes",
          "Order Notes",
          "Total (RWF)",
          "Status",
          "Prep",
          "Reject",
          "TxId",
          "Date",
        ].join(","),
        ...orders.map((o) => {
          const items = (o.items as any[])
            .map((i: any) => {
              const mods = (i.selectedModifiers ?? [])
                .map((m: any) => m.optionName)
                .join("+");
              return `${i.name}${mods ? ` [${mods}]` : ""} x${i.qty}`;
            })
            .join(" | ");
          const itemNotes = (o.items as any[])
            .map((i: any) => (i.specialInstructions ? `${i.name}: ${i.specialInstructions}` : ""))
            .filter(Boolean)
            .join(" | ");
          const location =
            o.orderContext === "ROOM" ? o.roomNumber ?? "" : o.tableNumber ?? "";
          return [
            o.id.slice(-8).toUpperCase(),
            `"${o.customerName.replace(/"/g, '""')}"`,
            o.phone,
            o.orderContext,
            `"${location.replace(/"/g, '""')}"`,
            `"${items.replace(/"/g, '""')}"`,
            `"${itemNotes.replace(/"/g, '""')}"`,
            `"${(o.notes ?? "").replace(/"/g, '""')}"`,
            o.total,
            o.status,
            o.prepStatus,
            `"${(o.rejectReason ?? o.rejectReasonCode ?? "").replace(/"/g, '""')}"`,
            o.txId ?? "",
            new Date(o.createdAt).toLocaleString(),
          ].join(",");
        }),
      ].join("\n");

      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="orders-${access.businessName.replace(/\s+/g, "-")}.csv"`,
      );
      res.status(200).send(rows);
    } catch (error) {
      next(error);
    }
  },

  async deleteOrder(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.userId;
      const { id } = req.params;

      const order = await prisma.order.findUnique({
        where: { id },
        include: { business: { select: { userId: true, id: true } } },
      });

      if (!order) {
        res.status(404).json({ success: false, message: "Order not found" });
        return;
      }

      const allowed = await userCanAccessBusinessOrder(
        userId,
        req.user!.role,
        order.business.userId,
        order.business.id,
      );
      if (!allowed) {
        res.status(403).json({ success: false, message: "Access denied" });
        return;
      }

      const access = await resolveBusinessAccess(userId, req.user!.role);
      if (!access?.isOwner && req.user!.role !== "ADMIN") {
        res.status(403).json({
          success: false,
          message: "Only the business owner can delete orders",
        });
        return;
      }

      if (order.status !== "PAID" && order.status !== "REJECTED") {
        res.status(400).json({
          success: false,
          message: "Only completed or rejected orders can be deleted",
        });
        return;
      }

      await prisma.order.delete({ where: { id } });
      emitBusinessOrderEvent(order.businessId, "order:updated", { id, deleted: true });
      res.status(200).json({ success: true, message: "Order deleted" });
    } catch (error) {
      next(error);
    }
  },

  async confirmOrder(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.userId;
      const { id } = req.params;

      const order = await prisma.order.findUnique({
        where: { id },
        include: { business: { select: { userId: true, id: true } } },
      });

      if (!order) {
        res.status(404).json({ success: false, message: "Order not found" });
        return;
      }

      const allowed = await userCanAccessBusinessOrder(
        userId,
        req.user!.role,
        order.business.userId,
        order.business.id,
      );
      if (!allowed) {
        res.status(403).json({ success: false, message: "Access denied" });
        return;
      }

      const items = (order.items as OrderItemSnapshot[]).map((i) => ({
        ...i,
        linePrepStatus: i.linePrepStatus === "CANCELLED" ? i.linePrepStatus : "QUEUED",
      }));

      const updated = await prisma.order.update({
        where: { id },
        data: {
          status: "PAID",
          prepStatus: PrepStatus.RECEIVED,
          items,
        },
        include: { events: { orderBy: { createdAt: "desc" }, take: 8 } },
      });

      await recordOrderEvent({
        orderId: id,
        action: "CONFIRMED",
        actorUserId: userId,
        actorName: actorNameFromReq(req),
        detail: "Payment confirmed — sent to stations",
      });

      emitBusinessOrderEvent(updated.businessId, "order:updated", updated);
      res.status(200).json({ success: true, data: updated });
    } catch (error) {
      next(error);
    }
  },

  async rejectOrder(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.userId;
      const { id } = req.params;
      const { reasonCode, reason, notifyGuest } = req.body as {
        reasonCode?: string;
        reason?: string;
        notifyGuest?: boolean;
      };

      const code = (reasonCode ?? "OTHER").toUpperCase() as RejectReasonCode;
      if (!REJECT_REASON_CODES.includes(code)) {
        res.status(400).json({
          success: false,
          message: `reasonCode must be one of: ${REJECT_REASON_CODES.join(", ")}`,
        });
        return;
      }

      const order = await prisma.order.findUnique({
        where: { id },
        include: {
          business: { select: { userId: true, id: true, name: true } },
        },
      });

      if (!order) {
        res.status(404).json({ success: false, message: "Order not found" });
        return;
      }

      const allowed = await userCanAccessBusinessOrder(
        userId,
        req.user!.role,
        order.business.userId,
        order.business.id,
      );
      if (!allowed) {
        res.status(403).json({ success: false, message: "Access denied" });
        return;
      }

      const reasonText =
        (typeof reason === "string" && reason.trim()
          ? reason.trim().slice(0, 500)
          : REJECT_REASON_LABELS[code]) || REJECT_REASON_LABELS.OTHER;

      const items = (order.items as OrderItemSnapshot[]).map((i) => ({
        ...i,
        linePrepStatus: "CANCELLED" as const,
      }));

      const updated = await prisma.order.update({
        where: { id },
        data: {
          status: "REJECTED",
          prepStatus: PrepStatus.CANCELLED,
          rejectReasonCode: code,
          rejectReason: reasonText,
          items,
        },
        include: { events: { orderBy: { createdAt: "desc" }, take: 8 } },
      });

      await recordOrderEvent({
        orderId: id,
        action: "REJECTED",
        actorUserId: userId,
        actorName: actorNameFromReq(req),
        detail: `${code}: ${reasonText}`,
      });

      const waMessage = `Hi ${order.customerName}, your order at ${order.business.name} could not be completed. Reason: ${reasonText}. Please contact us if you need help.`;
      const whatsappUrl = buildGuestWhatsAppRejectLink(order.phone, waMessage);

      emitBusinessOrderEvent(updated.businessId, "order:updated", updated);
      res.status(200).json({
        success: true,
        data: updated,
        notify: {
          whatsappUrl,
          smsHint: `SMS to ${order.phone}: ${waMessage}`,
          shouldNotify: Boolean(notifyGuest),
        },
      });
    } catch (error) {
      next(error);
    }
  },

  async updatePrepStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.userId;
      const { id } = req.params;
      const { prepStatus } = req.body as { prepStatus?: string };

      if (!prepStatus || !PREP_STATUSES.has(prepStatus)) {
        res.status(400).json({
          success: false,
          message: `prepStatus must be one of: ${[...PREP_STATUSES].join(", ")}`,
        });
        return;
      }

      const order = await prisma.order.findUnique({
        where: { id },
        include: { business: { select: { userId: true, id: true } } },
      });

      if (!order) {
        res.status(404).json({ success: false, message: "Order not found" });
        return;
      }

      const allowed = await userCanAccessBusinessOrder(
        userId,
        req.user!.role,
        order.business.userId,
        order.business.id,
      );
      if (!allowed) {
        res.status(403).json({ success: false, message: "Access denied" });
        return;
      }

      let items = order.items as OrderItemSnapshot[];
      if (prepStatus === "READY") {
        items = items.map((i) =>
          i.linePrepStatus === "CANCELLED" ? i : { ...i, linePrepStatus: "READY" },
        );
      } else if (prepStatus === "SERVED") {
        items = items.map((i) =>
          i.linePrepStatus === "CANCELLED" ? i : { ...i, linePrepStatus: "SERVED" },
        );
      } else if (prepStatus === "PREPARING") {
        items = items.map((i) =>
          i.linePrepStatus === "QUEUED" || !i.linePrepStatus
            ? { ...i, linePrepStatus: "PREPARING" }
            : i,
        );
      } else if (prepStatus === "RECEIVED") {
        items = items.map((i) =>
          i.linePrepStatus === "CANCELLED" ? i : { ...i, linePrepStatus: "QUEUED" },
        );
      }

      const updated = await prisma.order.update({
        where: { id },
        data: { prepStatus: prepStatus as PrepStatus, items },
        include: { events: { orderBy: { createdAt: "desc" }, take: 8 } },
      });

      await recordOrderEvent({
        orderId: id,
        action: "PREP_STATUS",
        actorUserId: userId,
        actorName: actorNameFromReq(req),
        detail: prepStatus,
      });

      emitBusinessOrderEvent(updated.businessId, "order:updated", updated);
      res.status(200).json({ success: true, data: updated });
    } catch (error) {
      next(error);
    }
  },

  /** Partial fulfill — update one line's prep status (bump / call) */
  async updateLinePrep(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.userId;
      const { id } = req.params;
      const { lineId, linePrepStatus } = req.body as {
        lineId?: string;
        linePrepStatus?: string;
      };

      if (!lineId || !linePrepStatus || !LINE_PREP.has(linePrepStatus)) {
        res.status(400).json({
          success: false,
          message: "lineId and linePrepStatus (QUEUED|PREPARING|READY|SERVED|CANCELLED) required",
        });
        return;
      }

      const order = await prisma.order.findUnique({
        where: { id },
        include: { business: { select: { userId: true, id: true } } },
      });
      if (!order) {
        res.status(404).json({ success: false, message: "Order not found" });
        return;
      }

      const allowed = await userCanAccessBusinessOrder(
        userId,
        req.user!.role,
        order.business.userId,
        order.business.id,
      );
      if (!allowed) {
        res.status(403).json({ success: false, message: "Access denied" });
        return;
      }

      const items = (order.items as OrderItemSnapshot[]).map((i) =>
        i.lineId === lineId ? { ...i, linePrepStatus: linePrepStatus as any } : i,
      );
      if (!(order.items as OrderItemSnapshot[]).some((i) => i.lineId === lineId)) {
        res.status(404).json({ success: false, message: "Line item not found" });
        return;
      }

      const prepStatus = deriveOrderPrepFromLines(items) as PrepStatus;

      const updated = await prisma.order.update({
        where: { id },
        data: { items, prepStatus },
        include: { events: { orderBy: { createdAt: "desc" }, take: 8 } },
      });

      await recordOrderEvent({
        orderId: id,
        action: linePrepStatus === "READY" ? "BUMP_READY" : "LINE_PREP",
        actorUserId: userId,
        actorName: actorNameFromReq(req),
        detail: `${lineId} → ${linePrepStatus}`,
      });

      emitBusinessOrderEvent(updated.businessId, "order:updated", updated);
      res.status(200).json({ success: true, data: updated });
    } catch (error) {
      next(error);
    }
  },

  async getOrderEvents(req: Request, res: Response, next: NextFunction) {
    try {
      const access = await resolveBusinessAccess(req.user!.userId, req.user!.role);
      if (!access) {
        res.status(404).json({ success: false, message: "Business access not found" });
        return;
      }
      const { id } = req.params;
      const order = await prisma.order.findFirst({
        where: { id, businessId: access.businessId },
        select: { id: true },
      });
      if (!order) {
        res.status(404).json({ success: false, message: "Order not found" });
        return;
      }
      const events = await prisma.orderEvent.findMany({
        where: { orderId: id },
        orderBy: { createdAt: "asc" },
      });
      res.status(200).json({ success: true, data: events });
    } catch (error) {
      next(error);
    }
  },
};
