import { createHash } from "crypto";
import prisma from "../lib/prisma";

export async function recordOrderEvent(params: {
  orderId: string;
  action: string;
  detail?: string | null;
  actorUserId?: string | null;
  actorName?: string | null;
}) {
  try {
    await prisma.orderEvent.create({
      data: {
        orderId: params.orderId,
        action: params.action,
        detail: params.detail ?? null,
        actorUserId: params.actorUserId ?? null,
        actorName: params.actorName ?? null,
      },
    });
  } catch {
    /* never block order flow on audit failure */
  }
}

export function stableCartDigest(phone: string, itemsJson: unknown): string {
  const phoneKey = String(phone).replace(/\D/g, "");
  const digest = createHash("sha256")
    .update(phoneKey)
    .update("|")
    .update(JSON.stringify(itemsJson))
    .digest("hex")
    .slice(0, 24);
  return digest;
}

export const REJECT_REASON_CODES = [
  "WRONG_TXID",
  "WRONG_AMOUNT",
  "OUT_OF_STOCK",
  "KITCHEN_CLOSED",
  "BUSY",
  "INVALID_ORDER",
  "OTHER",
] as const;

export type RejectReasonCode = (typeof REJECT_REASON_CODES)[number];

export const REJECT_REASON_LABELS: Record<RejectReasonCode, string> = {
  WRONG_TXID: "Wrong or unverifiable MoMo transaction ID",
  WRONG_AMOUNT: "Payment amount does not match order total",
  OUT_OF_STOCK: "One or more items are out of stock",
  KITCHEN_CLOSED: "Kitchen / bar is closed",
  BUSY: "Too busy to accept this order right now",
  INVALID_ORDER: "Order details were incomplete or invalid",
  OTHER: "Other",
};

/** Build WhatsApp deep link so staff can notify guest of rejection */
export function buildGuestWhatsAppRejectLink(phone: string, message: string): string {
  const digits = phone.replace(/\D/g, "");
  const text = encodeURIComponent(message);
  return `https://wa.me/${digits}?text=${text}`;
}
