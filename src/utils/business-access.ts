import { Role } from "@prisma/client";
import prisma from "../lib/prisma";

export type BusinessAccess = {
  businessId: string;
  businessName: string;
  businessType: string;
  isOwner: boolean;
  staffRole: "ORDERS" | "MANAGER" | null;
  station: "KITCHEN" | "BAR" | "FLOOR" | "ALL" | null;
};

/**
 * Resolve which business the authenticated user can manage orders for.
 * BUSINESS owners match via BusinessProfile.userId.
 * STAFF match via active BusinessStaff membership.
 */
export async function resolveBusinessAccess(
  userId: string,
  role: Role | string,
): Promise<BusinessAccess | null> {
  if (role === Role.BUSINESS || role === "BUSINESS" || role === Role.ADMIN || role === "ADMIN") {
    const owned = await prisma.businessProfile.findUnique({
      where: { userId },
      select: { id: true, name: true, businessType: true },
    });
    if (owned) {
      return {
        businessId: owned.id,
        businessName: owned.name,
        businessType: owned.businessType,
        isOwner: true,
        staffRole: null,
        station: "ALL",
      };
    }
  }

  const membership = await prisma.businessStaff.findFirst({
    where: { userId, isActive: true },
    include: {
      business: { select: { id: true, name: true, businessType: true } },
    },
  });

  if (!membership) return null;

  return {
    businessId: membership.business.id,
    businessName: membership.business.name,
    businessType: membership.business.businessType,
    isOwner: false,
    staffRole: membership.staffRole,
    station: membership.station,
  };
}

export async function userCanAccessBusinessOrder(
  userId: string,
  role: Role | string,
  businessUserId: string,
  businessId: string,
): Promise<boolean> {
  if (role === Role.ADMIN || role === "ADMIN") return true;
  if (businessUserId === userId) return true;

  const staff = await prisma.businessStaff.findFirst({
    where: { userId, businessId, isActive: true },
    select: { id: true },
  });
  return Boolean(staff);
}
