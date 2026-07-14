import { BusinessType } from "@prisma/client";

export type ModifierOption = {
  id: string;
  name: string;
  priceDelta: number;
};

export type ModifierGroup = {
  id: string;
  name: string;
  required?: boolean;
  maxSelect?: number;
  options: ModifierOption[];
};

export type CustomizationOptions = {
  groups: ModifierGroup[];
};

export type SelectedModifier = {
  groupId: string;
  groupName: string;
  optionId: string;
  optionName: string;
  priceDelta: number;
};

export type LinePrepStatus = "QUEUED" | "PREPARING" | "READY" | "SERVED" | "CANCELLED";
export type PrepStation = "KITCHEN" | "BAR" | "FLOOR" | "ALL";

export type OrderItemSnapshot = {
  lineId: string;
  id: string;
  name: string;
  price: number;
  qty: number;
  imageUrl: string | null;
  specialInstructions?: string;
  selectedModifiers?: SelectedModifier[];
  /** Unit price including selected modifier deltas */
  unitPrice?: number;
  station?: PrepStation;
  linePrepStatus?: LinePrepStatus;
};

/** Suggested free-text chips shown to guests by venue type */
export const SPECIAL_REQUEST_PRESETS: Record<BusinessType, string[]> = {
  RESTAURANT: [
    "Less cheese",
    "No onions",
    "Extra spicy",
    "No salt",
    "Gluten-free if possible",
    "Well done",
    "Sauce on the side",
  ],
  BAR: [
    "Less ice",
    "No ice",
    "Extra strong",
    "Light on sugar",
    "Virgin / no alcohol",
    "Rim with salt",
    "Extra garnish",
  ],
  CAFE: [
    "Little sugar",
    "No sugar",
    "Oat milk",
    "Extra shot",
    "Decaf",
    "Not too hot",
    "Extra foam",
  ],
  HOTEL: [
    "No ice",
    "Extra napkins",
    "Quiet delivery",
    "Knock don't enter",
    "Allergy: nuts",
    "Less oil",
    "Cutlery please",
  ],
  MOTEL: [
    "No ice",
    "Extra napkins",
    "Quiet delivery",
    "Knock don't enter",
    "Allergy: nuts",
    "Less oil",
  ],
  OTHER: ["No onions", "Less spicy", "Extra sauce", "Allergy note"],
};

export const ORDER_NOTES_PLACEHOLDER: Record<BusinessType, string> = {
  RESTAURANT: "Allergies, seating preference, or anything the kitchen should know…",
  BAR: "How you want your drinks mixed, ice preference, or bar notes…",
  CAFE: "Milk preference, sweetness, temperature…",
  HOTEL: "Delivery preference, timing, or allergy notes for room service…",
  MOTEL: "Delivery preference, timing, or allergy notes…",
  OTHER: "Any special requests for this order…",
};

export const ITEM_HINT_BY_TYPE: Record<BusinessType, string> = {
  RESTAURANT: "e.g. less cheese, no onions, medium spicy…",
  BAR: "e.g. less ice, light sugar, shaken not stirred…",
  CAFE: "e.g. oat milk, little sugar, extra hot…",
  HOTEL: "e.g. no ice, allergies, leave at door…",
  MOTEL: "e.g. no ice, allergies, leave at door…",
  OTHER: "Tell us exactly how you want it…",
};

/** Default structured groups businesses can apply to a menu item */
export function defaultCustomizationTemplate(type: BusinessType): CustomizationOptions {
  switch (type) {
    case "BAR":
      return {
        groups: [
          {
            id: "ice",
            name: "Ice",
            required: true,
            maxSelect: 1,
            options: [
              { id: "regular", name: "Regular ice", priceDelta: 0 },
              { id: "less", name: "Less ice", priceDelta: 0 },
              { id: "none", name: "No ice", priceDelta: 0 },
            ],
          },
          {
            id: "sweetness",
            name: "Sweetness",
            required: false,
            maxSelect: 1,
            options: [
              { id: "normal", name: "Normal", priceDelta: 0 },
              { id: "less", name: "Less sugar", priceDelta: 0 },
              { id: "none", name: "No sugar", priceDelta: 0 },
            ],
          },
        ],
      };
    case "CAFE":
      return {
        groups: [
          {
            id: "milk",
            name: "Milk",
            required: false,
            maxSelect: 1,
            options: [
              { id: "dairy", name: "Dairy", priceDelta: 0 },
              { id: "oat", name: "Oat milk", priceDelta: 500 },
              { id: "soy", name: "Soy milk", priceDelta: 500 },
              { id: "none", name: "No milk", priceDelta: 0 },
            ],
          },
          {
            id: "sugar",
            name: "Sugar",
            required: false,
            maxSelect: 1,
            options: [
              { id: "normal", name: "Normal", priceDelta: 0 },
              { id: "little", name: "Little sugar", priceDelta: 0 },
              { id: "none", name: "No sugar", priceDelta: 0 },
            ],
          },
        ],
      };
    case "HOTEL":
    case "MOTEL":
      return {
        groups: [
          {
            id: "delivery",
            name: "Delivery preference",
            required: false,
            maxSelect: 1,
            options: [
              { id: "door", name: "Leave at door", priceDelta: 0 },
              { id: "knock", name: "Knock and wait", priceDelta: 0 },
              { id: "call", name: "Call on arrival", priceDelta: 0 },
            ],
          },
        ],
      };
    case "RESTAURANT":
    default:
      return {
        groups: [
          {
            id: "spice",
            name: "Spice level",
            required: false,
            maxSelect: 1,
            options: [
              { id: "mild", name: "Mild", priceDelta: 0 },
              { id: "medium", name: "Medium", priceDelta: 0 },
              { id: "hot", name: "Hot", priceDelta: 0 },
            ],
          },
          {
            id: "doneness",
            name: "Cooking preference",
            required: false,
            maxSelect: 1,
            options: [
              { id: "normal", name: "As usual", priceDelta: 0 },
              { id: "well", name: "Well done", priceDelta: 0 },
              { id: "light", name: "Light / soft", priceDelta: 0 },
            ],
          },
        ],
      };
  }
}

export function parseCustomizationOptions(value: unknown): CustomizationOptions | null {
  if (!value || typeof value !== "object") return null;
  const groups = (value as { groups?: unknown }).groups;
  if (!Array.isArray(groups)) return null;
  return value as CustomizationOptions;
}

export function normalizeOrderItems(raw: unknown): OrderItemSnapshot[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error("items must be a non-empty array");
  }

  return raw.map((item, index) => {
    if (!item || typeof item !== "object") {
      throw new Error(`items[${index}] is invalid`);
    }
    const row = item as Record<string, unknown>;
    const id = typeof row.id === "string" ? row.id : "";
    const name = typeof row.name === "string" ? row.name.trim() : "";
    const price = Number(row.price);
    const qty = Math.floor(Number(row.qty));
    if (!id || !name || !Number.isFinite(price) || price < 0 || !Number.isFinite(qty) || qty < 1) {
      throw new Error(`items[${index}] needs valid id, name, price, and qty`);
    }

    const imageUrl =
      typeof row.imageUrl === "string" ? row.imageUrl : row.imageUrl === null ? null : null;

    const specialInstructions =
      typeof row.specialInstructions === "string" && row.specialInstructions.trim()
        ? row.specialInstructions.trim().slice(0, 500)
        : undefined;

    let selectedModifiers: SelectedModifier[] | undefined;
    if (Array.isArray(row.selectedModifiers)) {
      selectedModifiers = row.selectedModifiers
        .filter((m) => m && typeof m === "object")
        .map((m) => {
          const mod = m as Record<string, unknown>;
          return {
            groupId: String(mod.groupId ?? ""),
            groupName: String(mod.groupName ?? ""),
            optionId: String(mod.optionId ?? ""),
            optionName: String(mod.optionName ?? ""),
            priceDelta: Number(mod.priceDelta) || 0,
          };
        })
        .filter((m) => m.optionName);
    }

    const modifierTotal = (selectedModifiers ?? []).reduce((sum, m) => sum + m.priceDelta, 0);
    // If client already sent price as unit+mods, avoid double-adding when modifiers present with adjusted price
    const basePrice = Number.isFinite(Number(row.basePrice)) ? Number(row.basePrice) : price;
    const hasExplicitUnit =
      Number.isFinite(Number(row.unitPrice)) ? Number(row.unitPrice) : null;
    const unitPrice =
      hasExplicitUnit ??
      (selectedModifiers?.length ? basePrice + modifierTotal : price);

    const stationRaw = typeof row.station === "string" ? row.station.toUpperCase() : "KITCHEN";
    const station: PrepStation =
      stationRaw === "BAR" || stationRaw === "FLOOR" || stationRaw === "KITCHEN"
        ? stationRaw
        : "KITCHEN";

    const lineId =
      typeof row.lineId === "string" && row.lineId.trim()
        ? row.lineId.trim()
        : `${id}-${index}-${Date.now().toString(36)}`;

    const linePrepRaw =
      typeof row.linePrepStatus === "string" ? row.linePrepStatus.toUpperCase() : "QUEUED";
    const linePrepStatus: LinePrepStatus =
      linePrepRaw === "PREPARING" ||
      linePrepRaw === "READY" ||
      linePrepRaw === "SERVED" ||
      linePrepRaw === "CANCELLED"
        ? linePrepRaw
        : "QUEUED";

    return {
      lineId,
      id,
      name,
      price: unitPrice,
      qty,
      imageUrl,
      specialInstructions,
      selectedModifiers,
      unitPrice,
      station,
      linePrepStatus,
    };
  });
}

export function computeCartHash(phone: string, items: OrderItemSnapshot[]): string {
  const normalizedPhone = phone.replace(/\D/g, "");
  const payload = items
    .map((i) => {
      const mods = (i.selectedModifiers ?? [])
        .map((m) => m.optionId)
        .sort()
        .join("+");
      return `${i.id}:${i.qty}:${mods}:${i.specialInstructions ?? ""}`;
    })
    .sort()
    .join("|");
  // Simple stable hash (non-crypto) for duplicate detection
  let h = 0;
  const s = `${normalizedPhone}::${payload}`;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return `c${Math.abs(h).toString(36)}`;
}

export function deriveOrderPrepFromLines(
  items: OrderItemSnapshot[],
): "NONE" | "RECEIVED" | "PREPARING" | "READY" | "SERVED" | "CANCELLED" {
  if (!items.length) return "NONE";
  const statuses = items.map((i) => i.linePrepStatus ?? "QUEUED");
  if (statuses.every((s) => s === "CANCELLED")) return "CANCELLED";
  if (statuses.every((s) => s === "SERVED" || s === "CANCELLED")) return "SERVED";
  if (statuses.every((s) => s === "READY" || s === "SERVED" || s === "CANCELLED")) return "READY";
  if (statuses.some((s) => s === "PREPARING" || s === "READY" || s === "SERVED")) return "PREPARING";
  return "RECEIVED";
}
