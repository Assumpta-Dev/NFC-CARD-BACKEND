import { Request, Response, NextFunction } from "express";
import prisma from "../lib/prisma";
import cloudinary from "../lib/cloudinary";
import { AppError } from "../middleware/error.middleware";

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

export const BusinessController = {
  /**
   * POST /api/business
   * Create or update business profile (supports multipart photo upload)
   */
  async upsertBusinessProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.userId;
      const name = normalizeRequiredString(req.body.name, "Business name");
      const category = normalizeRequiredString(req.body.category, "Category");
      const description = readOptionalField(req.body, "description");
      const location = readOptionalField(req.body, "location");
      const phone = readOptionalField(req.body, "phone");
      const email = readOptionalField(req.body, "email");
      const website = readOptionalField(req.body, "website");
      const paymentCode = readOptionalField(req.body, "paymentCode");
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
        description,
        location,
        phone,
        category,
        email,
        website,
        paymentCode,
        ...(imageUrl !== undefined ? { imageUrl } : {}),
      };

      const business = await prisma.businessProfile.upsert({
        where: { userId },
        update: updateData,
        create: {
          userId,
          name,
          description,
          location,
          phone,
          category,
          email,
          website,
          paymentCode,
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
          // @ts-ignore - Bypass phantom IDE cache error
          cards: {
            select: {
              id: true,
              cardId: true,
              status: true,
              createdAt: true,
            },
          },
        } as any,

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
        // @ts-ignore - Bypass phantom IDE cache error
        where: { businessProfileId: business.id } as any,
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
        // @ts-ignore - Bypass phantom IDE cache error
        data: {
          businessProfileId: business.id,
          status: "ACTIVE",
        } as any,
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
};
