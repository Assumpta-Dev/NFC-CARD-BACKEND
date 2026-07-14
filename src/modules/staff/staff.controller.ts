import { Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import { Role, StaffRole, PrepStation } from "@prisma/client";
import prisma from "../../lib/prisma";

function parseStaffRole(value: unknown): StaffRole {
  if (value === "MANAGER") return StaffRole.MANAGER;
  return StaffRole.ORDERS;
}

function parseStation(value: unknown): PrepStation {
  const v = String(value ?? "ALL").toUpperCase();
  if (v === "KITCHEN" || v === "BAR" || v === "FLOOR" || v === "ALL") {
    return v as PrepStation;
  }
  return PrepStation.ALL;
}

export const StaffController = {
  /** Business owner lists staff for their venue */
  async list(req: Request, res: Response, next: NextFunction) {
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

      const staff = await prisma.businessStaff.findMany({
        where: { businessId: business.id },
        include: {
          user: { select: { id: true, name: true, email: true, role: true, createdAt: true } },
        },
        orderBy: { createdAt: "desc" },
      });

      res.status(200).json({
        success: true,
        data: staff.map((s) => ({
          id: s.id,
          staffRole: s.staffRole,
          station: s.station,
          isActive: s.isActive,
          createdAt: s.createdAt,
          user: s.user,
        })),
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Create a staff login for the order portal.
   * Body: { name, email, password, staffRole? }
   */
  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const ownerId = req.user!.userId;
      const { name, email, password, staffRole, station } = req.body as {
        name?: string;
        email?: string;
        password?: string;
        staffRole?: string;
        station?: string;
      };

      if (!name?.trim() || !email?.trim() || !password || password.length < 8) {
        res.status(400).json({
          success: false,
          message: "name, email, and password (min 8 chars) are required",
        });
        return;
      }

      const business = await prisma.businessProfile.findUnique({
        where: { userId: ownerId },
        select: { id: true, name: true },
      });
      if (!business) {
        res.status(404).json({ success: false, message: "Business profile not found" });
        return;
      }

      const normalizedEmail = email.trim().toLowerCase();
      const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
      if (existing) {
        res.status(409).json({
          success: false,
          message: "A user with this email already exists. Use a unique staff email.",
        });
        return;
      }

      const hashed = await bcrypt.hash(password, 12);
      const role = parseStaffRole(staffRole);
      const prepStation = parseStation(station);

      const created = await prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            name: name.trim(),
            email: normalizedEmail,
            password: hashed,
            role: Role.STAFF,
          },
        });

        const membership = await tx.businessStaff.create({
          data: {
            businessId: business.id,
            userId: user.id,
            staffRole: role,
            station: prepStation,
          },
        });

        return { user, membership };
      });

      res.status(201).json({
        success: true,
        message: "Staff account created. They can log in to the orders portal.",
        data: {
          id: created.membership.id,
          staffRole: created.membership.staffRole,
          station: created.membership.station,
          isActive: created.membership.isActive,
          businessName: business.name,
          user: {
            id: created.user.id,
            name: created.user.name,
            email: created.user.email,
            role: created.user.role,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  },

  async setActive(req: Request, res: Response, next: NextFunction) {
    try {
      const ownerId = req.user!.userId;
      const { id } = req.params;
      const { isActive } = req.body as { isActive?: boolean };

      if (typeof isActive !== "boolean") {
        res.status(400).json({ success: false, message: "isActive boolean is required" });
        return;
      }

      const business = await prisma.businessProfile.findUnique({
        where: { userId: ownerId },
        select: { id: true },
      });
      if (!business) {
        res.status(404).json({ success: false, message: "Business profile not found" });
        return;
      }

      const staff = await prisma.businessStaff.findFirst({
        where: { id, businessId: business.id },
      });
      if (!staff) {
        res.status(404).json({ success: false, message: "Staff member not found" });
        return;
      }

      const updated = await prisma.businessStaff.update({
        where: { id },
        data: { isActive },
        include: {
          user: { select: { id: true, name: true, email: true, role: true } },
        },
      });

      res.status(200).json({
        success: true,
        data: {
          id: updated.id,
          staffRole: updated.staffRole,
          isActive: updated.isActive,
          user: updated.user,
        },
      });
    } catch (error) {
      next(error);
    }
  },

  async remove(req: Request, res: Response, next: NextFunction) {
    try {
      const ownerId = req.user!.userId;
      const { id } = req.params;

      const business = await prisma.businessProfile.findUnique({
        where: { userId: ownerId },
        select: { id: true },
      });
      if (!business) {
        res.status(404).json({ success: false, message: "Business profile not found" });
        return;
      }

      const staff = await prisma.businessStaff.findFirst({
        where: { id, businessId: business.id },
        include: { user: { select: { id: true, role: true } } },
      });
      if (!staff) {
        res.status(404).json({ success: false, message: "Staff member not found" });
        return;
      }

      await prisma.$transaction(async (tx) => {
        await tx.businessStaff.delete({ where: { id } });
        if (staff.user.role === Role.STAFF) {
          await tx.user.delete({ where: { id: staff.user.id } });
        }
      });

      res.status(200).json({ success: true, message: "Staff removed" });
    } catch (error) {
      next(error);
    }
  },

  /** Staff (or owner) — who am I attached to? */
  async me(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.userId;
      const role = req.user!.role;

      if ((role as string) === "BUSINESS") {
        const business = await prisma.businessProfile.findUnique({
          where: { userId },
          select: { id: true, name: true, businessType: true },
        });
        if (!business) {
          res.status(404).json({ success: false, message: "Business profile not found" });
          return;
        }
        res.status(200).json({
          success: true,
          data: {
            isOwner: true,
            staffRole: null,
            business,
          },
        });
        return;
      }

      const membership = await prisma.businessStaff.findFirst({
        where: { userId, isActive: true },
        include: {
          business: { select: { id: true, name: true, businessType: true } },
        },
      });

      if (!membership) {
        res.status(404).json({
          success: false,
          message: "No active staff membership found",
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: {
          isOwner: false,
          staffRole: membership.staffRole,
          business: membership.business,
        },
      });
    } catch (error) {
      next(error);
    }
  },
};
