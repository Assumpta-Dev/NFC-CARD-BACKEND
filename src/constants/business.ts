import { BusinessType, OrderContext } from "@prisma/client";

export const BUSINESS_TYPE_VALUES = [
  "RESTAURANT",
  "HOTEL",
  "MOTEL",
  "CAFE",
  "OTHER",
] as const satisfies readonly BusinessType[];

export const BUSINESS_TYPE_LABELS: Record<BusinessType, string> = {
  RESTAURANT: "Restaurant",
  HOTEL: "Hotel",
  MOTEL: "Motel",
  CAFE: "Cafe",
  OTHER: "Other",
};

export interface BusinessSettings {
  wifiPassword?: string;
  checkInTime?: string;
  checkOutTime?: string;
  operatingHours?: string;
  emergencyPhone?: string;
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

  const optionalStringFields: (keyof BusinessSettings)[] = [
    "wifiPassword",
    "checkInTime",
    "checkOutTime",
    "operatingHours",
    "emergencyPhone",
  ];

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

  return Object.keys(settings).length ? settings : null;
}

export function isLodgingType(type: BusinessType): boolean {
  return type === "HOTEL" || type === "MOTEL";
}

export function parseOrderContext(value: unknown): OrderContext {
  if (typeof value !== "string" || !value.trim()) {
    return "TABLE";
  }

  const normalized = value.trim().toUpperCase();
  if (normalized === "ROOM") return "ROOM";
  if (normalized === "TABLE") return "TABLE";
  throw new Error("orderContext must be TABLE or ROOM");
}
