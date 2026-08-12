import { Request, Response, NextFunction } from "express";
import prisma from "../../lib/prisma";
import cloudinary from "../../lib/cloudinary";
import { AppError } from "../../middleware/error.middleware";

function parseBoolean(value: unknown, fallback: boolean) {
  if (value === undefined || value === null) return fallback;
  return value === true || value === "true" || value === "1";
}

function parseOptionalInteger(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = typeof value === "string" ? Number.parseInt(value, 10) : Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export const MenuController = {
  async createMenu(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const userId = req.user!.userId;

      const business = await prisma.businessProfile.findUnique({
        where: { userId },
      });

      if (!business) {
        res.status(400).json({
          success: false,
          message: "No business profile found. Please create one first.",
        });
        return;
      }

      const { title } = req.body;

      const menu = await prisma.menu.create({
        data: {
          title,
          businessId: business.id,
        },
      });

      res.status(201).json({
        success: true,
        message: "Menu created successfully",
        data: menu,
      });

      return;
    } catch (error) {
      next(error);
    }
  },
  async getMenus(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const userId = req.user!.userId;

      const business = await prisma.businessProfile.findUnique({
        where: { userId },
        select: { id: true },
      });

      if (!business) {
        res.status(404).json({
          success: false,
          message: "No business profile found.",
        });
        return;
      }

      const page = Math.max(Number(req.query.page) || 1, 1);
      const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 100);
      const skip = (page - 1) * limit;

      const [menus, total] = await Promise.all([
        prisma.menu.findMany({
          where: { businessId: business.id },
          include: {
            items: {
              orderBy: { createdAt: "desc" },
            },
          },
          skip,
          take: limit,
          orderBy: { createdAt: "asc" },
        }),
        prisma.menu.count({ where: { businessId: business.id } }),
      ]);

      res.status(200).json({
        success: true,
        data: menus,
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
  async addMenuItem(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { menuId } = req.params;
      const {
        name,
        price,
        sku,
        description,
        customizationHint,
        allowsSpecialInstructions,
        customizationOptions,
        trackInventory,
        stockQuantity,
        lowStockThreshold,
        isSoldOut,
        availability,
        station,
      } = req.body;

      // Ownership check: verify the menu belongs to this user's business
      const business = await prisma.businessProfile.findUnique({
        where: { userId },
        select: { id: true },
      });

      if (!business) {
        res.status(403).json({
          success: false,
          message: "No business profile found.",
        });
        return;
      }

      const menu = await prisma.menu.findUnique({
        where: { id: menuId },
        select: { businessId: true },
      });

      if (!menu) {
        res.status(404).json({ success: false, message: "Menu not found" });
        return;
      }

      if (menu.businessId !== business.id) {
        res.status(403).json({
          success: false,
          message: "You do not have access to this menu",
        });
        return;
      }

      let imageUrl: string | null = null;
      if (req.file) {
        imageUrl = await new Promise<string>((resolve, reject) => {
          // Generate a custom ID for the image to prevent duplicates filling up storage
          // but without risking overwrites of different items
          const fileId = `menu_item_${menuId}_${Date.now()}`;
          const stream = cloudinary.uploader.upload_stream(
            {
              folder: "nfc-cards/menu_items",
              public_id: fileId,
              resource_type: "image",
              format: req.file!.mimetype.split("/")[1],
            },
            (error, result) => {
              if (error || !result) return reject(new AppError(500, "Menu item photo upload failed"));
              resolve(result.secure_url);
            }
          );
          stream.end(req.file!.buffer);
        });
      }

      const processedPrice = typeof price === 'string' ? parseFloat(price) : price;

      let parsedOptions: unknown = undefined;
      if (customizationOptions !== undefined && customizationOptions !== null && customizationOptions !== "") {
        try {
          parsedOptions =
            typeof customizationOptions === "string"
              ? JSON.parse(customizationOptions)
              : customizationOptions;
        } catch {
          res.status(400).json({
            success: false,
            message: "customizationOptions must be valid JSON",
          });
          return;
        }
      }

      const allowSpecial = parseBoolean(allowsSpecialInstructions, true);
      const shouldTrackInventory = parseBoolean(trackInventory, false);
      const parsedStockQuantity = parseOptionalInteger(stockQuantity);
      const parsedLowStockThreshold = parseOptionalInteger(lowStockThreshold);

      if (parsedStockQuantity !== null && (!Number.isInteger(parsedStockQuantity) || parsedStockQuantity < 0)) {
        res.status(400).json({
          success: false,
          message: "stockQuantity must be a whole number greater than or equal to 0",
        });
        return;
      }

      if (
        parsedLowStockThreshold !== null &&
        (!Number.isInteger(parsedLowStockThreshold) || parsedLowStockThreshold < 0)
      ) {
        res.status(400).json({
          success: false,
          message: "lowStockThreshold must be a whole number greater than or equal to 0",
        });
        return;
      }

      if (shouldTrackInventory && parsedStockQuantity === null) {
        res.status(400).json({
          success: false,
          message: "stockQuantity is required when inventory tracking is enabled",
        });
        return;
      }

      const normalizedStockQuantity = shouldTrackInventory ? parsedStockQuantity : null;
      const normalizedLowStockThreshold =
        parsedLowStockThreshold === null ? 5 : parsedLowStockThreshold;
      const computedSoldOut =
        normalizedStockQuantity !== null ? normalizedStockQuantity <= 0 : parseBoolean(isSoldOut, false);

      const item = await prisma.menuItem.create({
        data: {
          name,
          price: processedPrice, // ensures multipart inputs are correctly casted to Float
          sku: typeof sku === "string" && sku.trim() ? sku.trim().slice(0, 80) : null,
          description,
          menuId,
          customizationHint:
            typeof customizationHint === "string" && customizationHint.trim()
              ? customizationHint.trim().slice(0, 300)
              : null,
          allowsSpecialInstructions: allowSpecial,
          trackInventory: shouldTrackInventory,
          stockQuantity: normalizedStockQuantity,
          lowStockThreshold: normalizedLowStockThreshold,
          isSoldOut: computedSoldOut,
          availability: ["ALL", "HAPPY_HOUR", "ROOM_SERVICE", "DINE_IN"].includes(
            String(availability ?? "").toUpperCase(),
          )
            ? (String(availability).toUpperCase() as any)
            : "ALL",
          station: ["KITCHEN", "BAR", "FLOOR"].includes(String(station ?? "").toUpperCase())
            ? (String(station).toUpperCase() as any)
            : "KITCHEN",
          ...(parsedOptions !== undefined ? { customizationOptions: parsedOptions as object } : {}),
          ...(imageUrl ? { imageUrl } : {}),
        },
      });

      res.status(201).json({
        success: true,
        message: "Menu item added successfully",
        data: item,
      });

      return;
    } catch (error) {
      next(error);
    }
  },

  async updateMenuItem(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { menuId, itemId } = req.params;
      const {
        name,
        price,
        sku,
        description,
        customizationHint,
        allowsSpecialInstructions,
        customizationOptions,
        trackInventory,
        stockQuantity,
        lowStockThreshold,
        isSoldOut,
        availability,
        station,
      } = req.body;

      const business = await prisma.businessProfile.findUnique({
        where: { userId },
        select: { id: true },
      });
      if (!business) {
        res.status(403).json({ success: false, message: "No business profile found." });
        return;
      }

      const menu = await prisma.menu.findUnique({
        where: { id: menuId },
        select: { businessId: true },
      });
      if (!menu || menu.businessId !== business.id) {
        res.status(403).json({ success: false, message: "You do not have access to this menu" });
        return;
      }

      const existing = await prisma.menuItem.findFirst({
        where: { id: itemId, menuId },
      });
      if (!existing) {
        res.status(404).json({ success: false, message: "Menu item not found" });
        return;
      }

      const data: Record<string, unknown> = {};
      if (typeof name === "string" && name.trim()) data.name = name.trim();
      if (sku !== undefined) {
        data.sku = typeof sku === "string" && sku.trim() ? sku.trim().slice(0, 80) : null;
      }
      if (price !== undefined) {
        data.price = typeof price === "string" ? parseFloat(price) : price;
      }
      if (description !== undefined) {
        data.description = typeof description === "string" ? description : null;
      }
      if (customizationHint !== undefined) {
        data.customizationHint =
          typeof customizationHint === "string" && customizationHint.trim()
            ? customizationHint.trim().slice(0, 300)
            : null;
      }
      if (allowsSpecialInstructions !== undefined) {
        data.allowsSpecialInstructions = parseBoolean(allowsSpecialInstructions, true);
      }

      const shouldTrackInventory =
        trackInventory === undefined
          ? existing.trackInventory
          : parseBoolean(trackInventory, existing.trackInventory);

      if (trackInventory !== undefined) {
        data.trackInventory = shouldTrackInventory;
      }

      const parsedStockQuantity = parseOptionalInteger(stockQuantity);
      if (stockQuantity !== undefined) {
        if (parsedStockQuantity === null) {
          data.stockQuantity = null;
        } else if (!Number.isInteger(parsedStockQuantity) || parsedStockQuantity < 0) {
          res.status(400).json({
            success: false,
            message: "stockQuantity must be a whole number greater than or equal to 0",
          });
          return;
        } else {
          data.stockQuantity = parsedStockQuantity;
        }
      }

      const parsedLowStockThreshold = parseOptionalInteger(lowStockThreshold);
      if (lowStockThreshold !== undefined) {
        if (
          parsedLowStockThreshold === null ||
          !Number.isInteger(parsedLowStockThreshold) ||
          parsedLowStockThreshold < 0
        ) {
          res.status(400).json({
            success: false,
            message: "lowStockThreshold must be a whole number greater than or equal to 0",
          });
          return;
        }
        data.lowStockThreshold = parsedLowStockThreshold;
      }

      const nextStockQuantity =
        data.stockQuantity !== undefined
          ? (data.stockQuantity as number | null)
          : existing.stockQuantity;

      if (shouldTrackInventory && nextStockQuantity === null) {
        res.status(400).json({
          success: false,
          message: "stockQuantity is required when inventory tracking is enabled",
        });
        return;
      }

      if (isSoldOut !== undefined) {
        data.isSoldOut = parseBoolean(isSoldOut, existing.isSoldOut);
      }

      if (shouldTrackInventory) {
        data.isSoldOut = (nextStockQuantity ?? 0) <= 0;
      } else if (trackInventory !== undefined && !shouldTrackInventory) {
        data.stockQuantity = null;
      }

      if (availability !== undefined) {
        const a = String(availability).toUpperCase();
        if (["ALL", "HAPPY_HOUR", "ROOM_SERVICE", "DINE_IN"].includes(a)) {
          data.availability = a;
        }
      }
      if (station !== undefined) {
        const s = String(station).toUpperCase();
        if (["KITCHEN", "BAR", "FLOOR"].includes(s)) data.station = s;
      }
      if (customizationOptions !== undefined) {
        if (customizationOptions === null || customizationOptions === "") {
          data.customizationOptions = null;
        } else {
          try {
            data.customizationOptions =
              typeof customizationOptions === "string"
                ? JSON.parse(customizationOptions)
                : customizationOptions;
          } catch {
            res.status(400).json({
              success: false,
              message: "customizationOptions must be valid JSON",
            });
            return;
          }
        }
      }

      const item = await prisma.menuItem.update({
        where: { id: itemId },
        data,
      });

      res.status(200).json({ success: true, data: item });
    } catch (error) {
      next(error);
    }
  },

  async getMenuItems(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const { menuId } = req.params;

      const page = Number(req.query.page);
      const limit = Number(req.query.limit);

      if (!page || !limit || page <= 0 || limit <= 0) {
        res.status(400).json({
          success: false,
          message: "page and limit are required and must be > 0",
        });
        return;
      }

      const skip = (page - 1) * limit;

      const [items, total] = await Promise.all([
        prisma.menuItem.findMany({
          where: { menuId },
          skip,
          take: limit,
          orderBy: { createdAt: "desc" },
        }),
        prisma.menuItem.count({
          where: { menuId },
        }),
      ]);

      res.status(200).json({
        success: true,
        data: items,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      });

      return;
    } catch (error) {
      next(error);
    }
  },
  async deleteMenuItem(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { menuId, itemId } = req.params;

      // Ownership check
      const business = await prisma.businessProfile.findUnique({
        where: { userId },
        select: { id: true },
      });

      if (!business) {
        res.status(403).json({
          success: false,
          message: "No business profile found.",
        });
        return;
      }

      const menu = await prisma.menu.findUnique({
        where: { id: menuId },
        select: { businessId: true },
      });

      if (!menu) {
        res.status(404).json({ success: false, message: "Menu not found" });
        return;
      }

      if (menu.businessId !== business.id) {
        res.status(403).json({
          success: false,
          message: "You do not have access to this menu",
        });
        return;
      }

      await prisma.menuItem.delete({ where: { id: itemId } });

      res.status(200).json({
        success: true,
        message: "Menu item deleted successfully",
      });
    } catch (error) {
      next(error);
    }
  },
};
