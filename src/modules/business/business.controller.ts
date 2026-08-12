import { Request, Response, NextFunction } from "express";
import prisma from "../../lib/prisma";
import cloudinary from "../../lib/cloudinary";
import { AppError } from "../../middleware/error.middleware";
import {
  categoryFromBusinessType,
  parseBusinessSettings,
  parseBusinessType,
} from "../../constants/business";
import { BusinessAnalyticsService } from "../../services/business-analytics.service";

function normalizeRequiredString(value: unknown, fieldName: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new AppError(400, `${fieldName} is required`);
  }

  return value.trim();
}

function normalizeOptionalString(value: unknown) {
  if (typeof value !== "string") return null;

  const normalized = value.trim();
  return normalized ? normalized : null;
}

function readOptionalField(body: Request["body"], key: string) {
  if (!Object.prototype.hasOwnProperty.call(body, key)) {
    return undefined;
  }

  return normalizeOptionalString(body[key]);
}

function parseOptionalNumber(value: unknown, fieldName: string) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const parsed = typeof value === "string" ? Number(value) : Number(value);

  if (!Number.isFinite(parsed)) {
    throw new AppError(400, `${fieldName} must be a valid number`);
  }

  return parsed;
}

function parseOptionalBoolean(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  return value === true || value === "true" || value === "1";
}

const INVENTORY_CATEGORIES = new Set([
  "INGREDIENT",
  "PACKAGING",
  "SUPPLY",
  "PRODUCT",
  "OTHER",
]);

const INVENTORY_UNITS = new Set([
  "UNIT",
  "KG",
  "G",
  "LITER",
  "ML",
  "BOX",
  "PACK",
  "BOTTLE",
  "BAG",
]);

function roundInventoryNumber(value: number) {
  return Number(value.toFixed(2));
}

function buildInventoryOverviewReport(resources: Array<{
  id: string;
  name: string;
  sku: string | null;
  category: string;
  unit: string;
  stockQuantity: number;
  lowStockThreshold: number;
  costPerUnit: number | null;
  supplier: string | null;
  storageLocation: string | null;
  isActive: boolean;
}>) {
  const activeResources = resources.filter((resource) => resource.isActive);
  const lowStockResources = activeResources.filter(
    (resource) =>
      resource.stockQuantity > 0 && resource.stockQuantity <= resource.lowStockThreshold,
  );
  const outOfStockResources = activeResources.filter(
    (resource) => resource.stockQuantity <= 0,
  );
  const healthyResources = activeResources.filter(
    (resource) => resource.stockQuantity > resource.lowStockThreshold,
  );
  const totalEstimatedValue = activeResources.reduce(
    (sum, resource) => sum + resource.stockQuantity * (resource.costPerUnit ?? 0),
    0,
  );
  const lowStockValue = lowStockResources.reduce(
    (sum, resource) => sum + resource.stockQuantity * (resource.costPerUnit ?? 0),
    0,
  );
  const outOfStockValue = outOfStockResources.reduce(
    (sum, resource) => sum + Math.max(resource.lowStockThreshold, 0) * (resource.costPerUnit ?? 0),
    0,
  );

  const categoryMap = new Map<
    string,
    {
      category: string;
      itemCount: number;
      lowStockCount: number;
      outOfStockCount: number;
      totalQuantity: number;
      estimatedValue: number;
    }
  >();

  for (const resource of activeResources) {
    const current = categoryMap.get(resource.category) ?? {
      category: resource.category,
      itemCount: 0,
      lowStockCount: 0,
      outOfStockCount: 0,
      totalQuantity: 0,
      estimatedValue: 0,
    };

    current.itemCount += 1;
    current.totalQuantity += resource.stockQuantity;
    current.estimatedValue += resource.stockQuantity * (resource.costPerUnit ?? 0);

    if (resource.stockQuantity <= 0) current.outOfStockCount += 1;
    else if (resource.stockQuantity <= resource.lowStockThreshold) current.lowStockCount += 1;

    categoryMap.set(resource.category, current);
  }

  const supplierMap = new Map<
    string,
    { supplier: string; itemCount: number; estimatedValue: number }
  >();

  for (const resource of activeResources) {
    const supplierName = resource.supplier?.trim() || "Unassigned";
    const current = supplierMap.get(supplierName) ?? {
      supplier: supplierName,
      itemCount: 0,
      estimatedValue: 0,
    };

    current.itemCount += 1;
    current.estimatedValue += resource.stockQuantity * (resource.costPerUnit ?? 0);
    supplierMap.set(supplierName, current);
  }

  const attentionItems = activeResources
    .filter(
      (resource) =>
        resource.stockQuantity <= 0 || resource.stockQuantity <= resource.lowStockThreshold,
    )
    .map((resource) => {
      const reorderTarget = Math.max(resource.lowStockThreshold, 0);
      const shortage = Math.max(reorderTarget - resource.stockQuantity, 0);
      const severity =
        resource.stockQuantity <= 0
          ? "OUT"
          : resource.lowStockThreshold > 0 &&
              resource.stockQuantity / resource.lowStockThreshold <= 0.5
            ? "CRITICAL"
            : "LOW";

      return {
        id: resource.id,
        name: resource.name,
        sku: resource.sku,
        category: resource.category,
        unit: resource.unit,
        stockQuantity: roundInventoryNumber(resource.stockQuantity),
        lowStockThreshold: roundInventoryNumber(resource.lowStockThreshold),
        shortage: roundInventoryNumber(shortage),
        estimatedValue: roundInventoryNumber(
          resource.stockQuantity * (resource.costPerUnit ?? 0),
        ),
        severity,
        storageLocation: resource.storageLocation,
        supplier: resource.supplier,
      };
    })
    .sort((a, b) => {
      const severityRank = { OUT: 0, CRITICAL: 1, LOW: 2 } as const;
      return (
        severityRank[a.severity as keyof typeof severityRank] -
          severityRank[b.severity as keyof typeof severityRank] ||
        b.shortage - a.shortage
      );
    })
    .slice(0, 6);

  const topValueItems = activeResources
    .map((resource) => ({
      id: resource.id,
      name: resource.name,
      category: resource.category,
      unit: resource.unit,
      stockQuantity: roundInventoryNumber(resource.stockQuantity),
      estimatedValue: roundInventoryNumber(
        resource.stockQuantity * (resource.costPerUnit ?? 0),
      ),
      costPerUnit: resource.costPerUnit === null ? null : roundInventoryNumber(resource.costPerUnit),
      storageLocation: resource.storageLocation,
    }))
    .filter((resource) => resource.estimatedValue > 0)
    .sort((a, b) => b.estimatedValue - a.estimatedValue)
    .slice(0, 6);

  const categoryBreakdown = Array.from(categoryMap.values())
    .map((entry) => ({
      ...entry,
      totalQuantity: roundInventoryNumber(entry.totalQuantity),
      estimatedValue: roundInventoryNumber(entry.estimatedValue),
    }))
    .sort((a, b) => b.estimatedValue - a.estimatedValue || b.itemCount - a.itemCount);

  const supplierBreakdown = Array.from(supplierMap.values())
    .map((entry) => ({
      ...entry,
      estimatedValue: roundInventoryNumber(entry.estimatedValue),
    }))
    .sort((a, b) => b.itemCount - a.itemCount || b.estimatedValue - a.estimatedValue)
    .slice(0, 6);

  const totalItems = resources.length;
  const activeItems = activeResources.length;
  const inactiveItems = totalItems - activeItems;
  const healthScore =
    activeItems === 0
      ? 100
      : roundInventoryNumber((healthyResources.length / activeItems) * 100);

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      totalItems,
      activeItems,
      inactiveItems,
      lowStockItems: lowStockResources.length,
      outOfStockItems: outOfStockResources.length,
      healthyItems: healthyResources.length,
      totalEstimatedValue: roundInventoryNumber(totalEstimatedValue),
      lowStockValue: roundInventoryNumber(lowStockValue),
      outOfStockValue: roundInventoryNumber(outOfStockValue),
      healthScore,
      suppliersTracked: supplierBreakdown.filter((entry) => entry.supplier !== "Unassigned").length,
    },
    categoryBreakdown,
    supplierBreakdown,
    attentionItems,
    topValueItems,
  };
}

export const BusinessController = {
  /**
   * POST /api/business
   * Create or update business profile (supports multipart photo upload)
   */
  async upsertBusinessProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.userId;
      const name = normalizeRequiredString(req.body.name, "Business name");

      let businessType;
      try {
        businessType = parseBusinessType(req.body.businessType ?? req.body.category);
      } catch (err) {
        throw new AppError(400, err instanceof Error ? err.message : "Invalid businessType");
      }

      const category =
        typeof req.body.category === "string" && req.body.category.trim()
          ? req.body.category.trim()
          : categoryFromBusinessType(businessType);
      const description = readOptionalField(req.body, "description");
      const location = readOptionalField(req.body, "location");
      const phone = readOptionalField(req.body, "phone");
      const email = readOptionalField(req.body, "email");
      const website = readOptionalField(req.body, "website");
      const paymentCode = readOptionalField(req.body, "paymentCode");
      const hasSettingsField = Object.prototype.hasOwnProperty.call(req.body, "settings");
      let settings;
      if (hasSettingsField) {
        try {
          settings = parseBusinessSettings(req.body.settings);
        } catch (err) {
          throw new AppError(400, err instanceof Error ? err.message : "Invalid settings");
        }
      }
      let imageUrl = readOptionalField(req.body, "imageUrl");

      // If a file was uploaded, stream it to Cloudinary
      if (req.file) {
        imageUrl = await new Promise<string>((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            {
              folder: "nfc-cards/businesses",
              public_id: `business_${userId}`, // overwrite previous upload
              overwrite: true,
              resource_type: "image",
              format: req.file!.mimetype.split("/")[1],
            },
            (error, result) => {
              if (error || !result) return reject(new AppError(500, "Business photo upload failed"));
              resolve(result.secure_url);
            }
          );
          stream.end(req.file!.buffer);
        });
      }

      const updateData = {
        name,
        businessType,
        description,
        location,
        phone,
        category,
        email,
        website,
        paymentCode,
        ...(settings !== undefined ? { settings } : {}),
        ...(imageUrl !== undefined ? { imageUrl } : {}),
      };

      const business = await prisma.businessProfile.upsert({
        where: { userId },
        update: updateData,
        create: {
          userId,
          name,
          businessType,
          description,
          location,
          phone,
          category,
          email,
          website,
          paymentCode,
          settings: settings ?? undefined,
          imageUrl: imageUrl ?? null,
        },
      });

      res.status(200).json({ success: true, data: business });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/business
   * Get the authenticated business owner's full profile (with menus)
   */
  async getMyBusiness(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.userId;

      const business = await prisma.businessProfile.findUnique({
        where: { userId },
        include: {
          menus: {
            include: {
              items: {
                orderBy: { createdAt: "desc" },
              },
            },
            orderBy: { createdAt: "asc" },
          },
          cards: {
            select: {
              id: true,
              cardId: true,
              status: true,
              createdAt: true,
            },
          },
        },
      });

      if (!business) {
        res.status(404).json({
          success: false,
          message: "No business profile found. Create one first.",
        });
        return;
      }

      res.status(200).json({ success: true, data: business });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/business/card
   * Get the card(s) linked to this business
   */
  async getMyBusinessCard(req: Request, res: Response, next: NextFunction) {
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

      const cards = await prisma.card.findMany({
        where: { businessProfileId: business.id },
        select: {
          id: true,
          cardId: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { scans: true } },
        },
      });

      res.status(200).json({ success: true, data: cards });
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/business/card
   * Link an existing unassigned card to this business profile
   */
  async linkCardToBusiness(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.userId;
      const { cardId } = req.body;

      if (!cardId) {
        res.status(400).json({ success: false, message: "cardId is required" });
        return;
      }

      const business = await prisma.businessProfile.findUnique({
        where: { userId },
        select: { id: true },
      });

      if (!business) {
        res.status(404).json({
          success: false,
          message: "No business profile found. Create one first.",
        });
        return;
      }

      // Find the card by the public cardId
      const card = await prisma.card.findUnique({
        where: { cardId },
      });

      if (!card) {
        res.status(404).json({ success: false, message: "Card not found" });
        return;
      }

      if ((card as any).businessProfileId && (card as any).businessProfileId !== business.id) {
        res.status(409).json({
          success: false,
          message: "This card is already linked to another business",
        });

        return;
      }

      // Link the card to this business and activate it
      const updated = await prisma.card.update({
        where: { id: card.id },
        data: {
          businessProfileId: business.id,
          status: "ACTIVE",
        },
      });


      res.status(200).json({
        success: true,
        message: "Card linked to your business successfully",
        data: updated,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/business/analytics
   * Revenue, orders, and operational insights for the business dashboard
   */
  async getBusinessAnalytics(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.userId;
      const business = await BusinessAnalyticsService.getBusinessIdForUser(userId);

      if (!business) {
        res.status(404).json({
          success: false,
          message: "No business profile found. Create one first.",
        });
        return;
      }

      const data = await BusinessAnalyticsService.getEarningsDashboard(business.id);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/business/analytics/scans?cardId=
   * NFC scan analytics for linked business cards
   */
  async getBusinessScanAnalytics(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.userId;
      const cardId =
        typeof req.query.cardId === "string" ? req.query.cardId : undefined;

      const business = await BusinessAnalyticsService.getBusinessIdForUser(userId);

      if (!business) {
        res.status(404).json({
          success: false,
          message: "No business profile found. Create one first.",
        });
        return;
      }

      const data = await BusinessAnalyticsService.getScanAnalytics(
        business.id,
        cardId,
      );

      if (cardId && data === null) {
        res.status(404).json({ success: false, message: "Card not found" });
        return;
      }

      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async getInventoryResources(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.userId;

      const business = await prisma.businessProfile.findUnique({
        where: { userId },
        select: { id: true },
      });

      if (!business) {
        res.status(404).json({
          success: false,
          message: "No business profile found. Create one first.",
        });
        return;
      }

      const page = Math.max(Number(req.query.page) || 1, 1);
      const limit = Math.min(Math.max(Number(req.query.limit) || 12, 1), 100);
      const skip = (page - 1) * limit;
      const rawSearch = typeof req.query.search === "string" ? req.query.search.trim() : "";
      const filter = typeof req.query.filter === "string" ? req.query.filter.toUpperCase() : "ALL";

      const where = {
        businessId: business.id,
        ...(rawSearch
          ? {
              OR: [
                { name: { contains: rawSearch, mode: "insensitive" as const } },
                { sku: { contains: rawSearch, mode: "insensitive" as const } },
                { supplier: { contains: rawSearch, mode: "insensitive" as const } },
                { storageLocation: { contains: rawSearch, mode: "insensitive" as const } },
              ],
            }
          : {}),
        ...(filter === "LOW"
          ? {
              isActive: true,
              stockQuantity: { gt: 0 },
            }
          : {}),
        ...(filter === "OUT"
          ? {
              isActive: true,
              stockQuantity: { lte: 0 },
            }
          : {}),
        ...(filter === "ACTIVE" ? { isActive: true } : {}),
        ...(filter === "INACTIVE" ? { isActive: false } : {}),
      };

      const [resources, total] = await Promise.all([
        prisma.inventoryResource.findMany({
          where,
          orderBy: [{ isActive: "desc" }, { category: "asc" }, { name: "asc" }],
          skip,
          take: limit,
        }),
        prisma.inventoryResource.count({ where }),
      ]);

      const filteredResources =
        filter === "LOW"
          ? resources.filter(
              (resource) =>
                resource.stockQuantity > 0 &&
                resource.stockQuantity <= resource.lowStockThreshold,
            )
          : resources;

      res.status(200).json({
        success: true,
        data: filteredResources,
        pagination: {
          page,
          limit,
          total,
          pages: Math.max(1, Math.ceil(total / limit)),
        },
      });
    } catch (error) {
      next(error);
    }
  },

  async getInventoryOverviewReport(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.userId;

      const business = await prisma.businessProfile.findUnique({
        where: { userId },
        select: { id: true },
      });

      if (!business) {
        res.status(404).json({
          success: false,
          message: "No business profile found. Create one first.",
        });
        return;
      }

      const resources = await prisma.inventoryResource.findMany({
        where: { businessId: business.id },
        select: {
          id: true,
          name: true,
          sku: true,
          category: true,
          unit: true,
          stockQuantity: true,
          lowStockThreshold: true,
          costPerUnit: true,
          supplier: true,
          storageLocation: true,
          isActive: true,
        },
      });

      res.status(200).json({
        success: true,
        data: buildInventoryOverviewReport(resources),
      });
    } catch (error) {
      next(error);
    }
  },

  async createInventoryResource(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.userId;

      const business = await prisma.businessProfile.findUnique({
        where: { userId },
        select: { id: true },
      });

      if (!business) {
        res.status(404).json({
          success: false,
          message: "No business profile found. Create one first.",
        });
        return;
      }

      const name = normalizeRequiredString(req.body.name, "Resource name");
      const category = String(req.body.category ?? "INGREDIENT").toUpperCase();
      const unit = String(req.body.unit ?? "UNIT").toUpperCase();

      if (!INVENTORY_CATEGORIES.has(category)) {
        throw new AppError(400, "Invalid resource category");
      }

      if (!INVENTORY_UNITS.has(unit)) {
        throw new AppError(400, "Invalid resource unit");
      }

      const stockQuantity = parseOptionalNumber(req.body.stockQuantity, "stockQuantity") ?? 0;
      const lowStockThreshold =
        parseOptionalNumber(req.body.lowStockThreshold, "lowStockThreshold") ?? 0;
      const costPerUnit = parseOptionalNumber(req.body.costPerUnit, "costPerUnit");

      if (stockQuantity < 0) {
        throw new AppError(400, "stockQuantity must be greater than or equal to 0");
      }

      if (lowStockThreshold < 0) {
        throw new AppError(400, "lowStockThreshold must be greater than or equal to 0");
      }

      if (costPerUnit !== undefined && costPerUnit < 0) {
        throw new AppError(400, "costPerUnit must be greater than or equal to 0");
      }

      const resource = await prisma.inventoryResource.create({
        data: {
          businessId: business.id,
          name,
          sku: normalizeOptionalString(req.body.sku),
          category: category as any,
          unit: unit as any,
          stockQuantity,
          lowStockThreshold,
          costPerUnit: costPerUnit ?? null,
          supplier: normalizeOptionalString(req.body.supplier),
          storageLocation: normalizeOptionalString(req.body.storageLocation),
          notes: normalizeOptionalString(req.body.notes),
          isActive: parseOptionalBoolean(req.body.isActive) ?? true,
        },
      });

      res.status(201).json({
        success: true,
        message: "Inventory resource created successfully",
        data: resource,
      });
    } catch (error) {
      next(error);
    }
  },

  async updateInventoryResource(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.userId;
      const { resourceId } = req.params;

      const business = await prisma.businessProfile.findUnique({
        where: { userId },
        select: { id: true },
      });

      if (!business) {
        res.status(404).json({
          success: false,
          message: "No business profile found. Create one first.",
        });
        return;
      }

      const existing = await prisma.inventoryResource.findFirst({
        where: { id: resourceId, businessId: business.id },
      });

      if (!existing) {
        res.status(404).json({
          success: false,
          message: "Inventory resource not found",
        });
        return;
      }

      const data: Record<string, unknown> = {};

      if (req.body.name !== undefined) {
        data.name = normalizeRequiredString(req.body.name, "Resource name");
      }

      if (req.body.sku !== undefined) {
        data.sku = normalizeOptionalString(req.body.sku);
      }

      if (req.body.category !== undefined) {
        const category = String(req.body.category).toUpperCase();
        if (!INVENTORY_CATEGORIES.has(category)) {
          throw new AppError(400, "Invalid resource category");
        }
        data.category = category;
      }

      if (req.body.unit !== undefined) {
        const unit = String(req.body.unit).toUpperCase();
        if (!INVENTORY_UNITS.has(unit)) {
          throw new AppError(400, "Invalid resource unit");
        }
        data.unit = unit;
      }

      if (req.body.stockQuantity !== undefined) {
        const stockQuantity = parseOptionalNumber(req.body.stockQuantity, "stockQuantity");
        if (stockQuantity === undefined || stockQuantity < 0) {
          throw new AppError(400, "stockQuantity must be greater than or equal to 0");
        }
        data.stockQuantity = stockQuantity;
      }

      if (req.body.lowStockThreshold !== undefined) {
        const lowStockThreshold = parseOptionalNumber(
          req.body.lowStockThreshold,
          "lowStockThreshold",
        );
        if (lowStockThreshold === undefined || lowStockThreshold < 0) {
          throw new AppError(400, "lowStockThreshold must be greater than or equal to 0");
        }
        data.lowStockThreshold = lowStockThreshold;
      }

      if (req.body.costPerUnit !== undefined) {
        if (req.body.costPerUnit === null || req.body.costPerUnit === "") {
          data.costPerUnit = null;
        } else {
          const costPerUnit = parseOptionalNumber(req.body.costPerUnit, "costPerUnit");
          if (costPerUnit === undefined || costPerUnit < 0) {
            throw new AppError(400, "costPerUnit must be greater than or equal to 0");
          }
          data.costPerUnit = costPerUnit;
        }
      }

      if (req.body.supplier !== undefined) {
        data.supplier = normalizeOptionalString(req.body.supplier);
      }

      if (req.body.storageLocation !== undefined) {
        data.storageLocation = normalizeOptionalString(req.body.storageLocation);
      }

      if (req.body.notes !== undefined) {
        data.notes = normalizeOptionalString(req.body.notes);
      }

      if (req.body.isActive !== undefined) {
        data.isActive = parseOptionalBoolean(req.body.isActive) ?? true;
      }

      const resource = await prisma.inventoryResource.update({
        where: { id: resourceId },
        data,
      });

      res.status(200).json({
        success: true,
        message: "Inventory resource updated successfully",
        data: resource,
      });
    } catch (error) {
      next(error);
    }
  },

  async deleteInventoryResource(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.userId;
      const { resourceId } = req.params;

      const business = await prisma.businessProfile.findUnique({
        where: { userId },
        select: { id: true },
      });

      if (!business) {
        res.status(404).json({
          success: false,
          message: "No business profile found. Create one first.",
        });
        return;
      }

      const existing = await prisma.inventoryResource.findFirst({
        where: { id: resourceId, businessId: business.id },
        select: { id: true, name: true },
      });

      if (!existing) {
        res.status(404).json({
          success: false,
          message: "Inventory resource not found",
        });
        return;
      }

      await prisma.inventoryResource.delete({
        where: { id: resourceId },
      });

      res.status(200).json({
        success: true,
        message: `${existing.name} deleted successfully`,
      });
    } catch (error) {
      next(error);
    }
  },
};
