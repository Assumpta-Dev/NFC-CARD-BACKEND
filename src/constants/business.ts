import { BusinessType, OrderContext } from "@prisma/client";

export const BUSINESS_TYPE_VALUES = [
  "RESTAURANT",
  "BAR",
  "HOTEL",
  "MOTEL",
  "CAFE",
  "OTHER",
] as const satisfies readonly BusinessType[];

export const BUSINESS_TYPE_LABELS: Record<BusinessType, string> = {
  RESTAURANT: "Restaurant",
  BAR: "Bar",
  HOTEL: "Hotel",
  MOTEL: "Motel",
  CAFE: "Cafe",
  OTHER: "Other",
};

export type KitchenLoad = "LOW" | "NORMAL" | "HIGH";

export interface BusinessSettings {
  wifiPassword?: string;
  checkInTime?: string;
  checkOutTime?: string;
  operatingHours?: string;
  emergencyPhone?: string;
  /** When true, public card cannot place orders */
  busyMode?: boolean;
  /** Base ETA in minutes shown to guests */
  estimatedWaitMinutes?: number;
  /** Multiplier signal for ETA: LOW / NORMAL / HIGH */
  kitchenLoad?: KitchenLoad;
  /** Happy hour window "17:00-19:00" (24h local) */
  happyHourWindow?: string;
}

const WAIT_BY_LOAD: Record<KitchenLoad, number> = {
  LOW: 0.7,
  NORMAL: 1,
  HIGH: 1.5,
};

export function computeEstimatedWaitMinutes(settings: BusinessSettings | null | undefined): number {
  const base = Math.max(5, Math.min(120, Number(settings?.estimatedWaitMinutes) || 15));
  const load = settings?.kitchenLoad ?? "NORMAL";
  return Math.max(5, Math.round(base * (WAIT_BY_LOAD[load] ?? 1)));
}

export function categoryFromBusinessType(type: BusinessType): string {
  return BUSINESS_TYPE_LABELS[type].toLowerCase();
}

export function parseBusinessType(value: unknown): BusinessType {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("businessType is required");
  }

  const normalized = value.trim().toUpperCase();
  if (!BUSINESS_TYPE_VALUES.includes(normalized as BusinessType)) {
    throw new Error(`Invalid businessType. Must be one of: ${BUSINESS_TYPE_VALUES.join(", ")}`);
  }

  return normalized as BusinessType;
}

function parseKitchenLoad(value: unknown): KitchenLoad | undefined {
  if (typeof value !== "string") return undefined;
  const v = value.trim().toUpperCase();
  if (v === "LOW" || v === "NORMAL" || v === "HIGH") return v;
  return undefined;
}

export function parseBusinessSettings(value: unknown): BusinessSettings | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  let parsed: unknown = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new Error("settings must be valid JSON");
    }
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("settings must be a JSON object");
  }

  const source = parsed as Record<string, unknown>;
  const settings: BusinessSettings = {};

  const optionalStringFields = [
    "wifiPassword",
    "checkInTime",
    "checkOutTime",
    "operatingHours",
    "emergencyPhone",
    "happyHourWindow",
  ] as const;

  for (const field of optionalStringFields) {
    if (!Object.prototype.hasOwnProperty.call(source, field)) continue;
    const fieldValue = source[field];
    if (fieldValue === null || fieldValue === undefined || fieldValue === "") continue;
    if (typeof fieldValue !== "string") {
      throw new Error(`${field} must be a string`);
    }
    const trimmed = fieldValue.trim();
    if (trimmed) settings[field] = trimmed;
  }

  if (Object.prototype.hasOwnProperty.call(source, "busyMode")) {
    const b = source.busyMode;
    settings.busyMode = b === true || b === "true" || b === 1 || b === "1";
  }

  if (Object.prototype.hasOwnProperty.call(source, "estimatedWaitMinutes")) {
    const n = Number(source.estimatedWaitMinutes);
    if (!Number.isFinite(n) || n < 0) {
      throw new Error("estimatedWaitMinutes must be a positive number");
    }
    settings.estimatedWaitMinutes = Math.round(n);
  }

  const load = parseKitchenLoad(source.kitchenLoad);
  if (load) settings.kitchenLoad = load;

  return Object.keys(settings).length ? settings : null;
}

/** Merge parsed patch onto existing settings object */
export function mergeBusinessSettings(
  existing: unknown,
  patch: BusinessSettings | null,
): BusinessSettings | null {
  const current =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? ({ ...(existing as BusinessSettings) } as BusinessSettings)
      : ({} as BusinessSettings);
  if (!patch) return Object.keys(current).length ? current : null;
  const next = { ...current, ...patch };
  return Object.keys(next).length ? next : null;
}

export function isLodgingType(type: BusinessType): boolean {
  return type === "HOTEL" || type === "MOTEL";
}

export function isFoodServiceType(type: BusinessType): boolean {
  return type === "RESTAURANT" || type === "BAR" || type === "CAFE";
}

export function parseOrderContext(value: unknown): OrderContext {
  if (typeof value !== "string" || !value.trim()) {
    return "TABLE";
  }

  const normalized = value.trim().toUpperCase();
  if (normalized === "ROOM") return "ROOM";
  if (normalized === "TABLE") return "TABLE";
  if (normalized === "BAR_SEAT" || normalized === "BAR") return "BAR_SEAT";
  throw new Error("orderContext must be TABLE, ROOM, or BAR_SEAT");
}

export function defaultOrderContextForType(type: BusinessType): OrderContext {
  if (isLodgingType(type)) return "ROOM";
  if (type === "BAR") return "BAR_SEAT";
  return "TABLE";
}

/** Parse "HH:MM-HH:MM" and check if now is inside (local server time). */
export function isWithinHappyHour(window?: string | null, now = new Date()): boolean {
  if (!window?.trim()) return false;
  const m = window.trim().match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);
  if (!m) return false;
  const start = Number(m[1]) * 60 + Number(m[2]);
  const end = Number(m[3]) * 60 + Number(m[4]);
  const cur = now.getHours() * 60 + now.getMinutes();
  if (start <= end) return cur >= start && cur <= end;
  // overnight window e.g. 22:00-02:00
  return cur >= start || cur <= end;
}
