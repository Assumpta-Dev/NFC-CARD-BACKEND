// ===========================================================
// CARD CONTROLLER
// ===========================================================
// Handles all card-related HTTP operations.
// The public card view route (GET /api/c/:cardId) is the
// most critical — it's hit on every NFC tap / QR scan.
// It must be fast (<2s) and requires NO authentication.
//
// Performance design:
//   - card.service.getCardByPublicId does ONE query that preloads
//     both businessProfile (menus+items) and user.profile (links)
//   - ScanService.recordScan fires in background (non-blocking)
//   - No second DB roundtrip needed for any card type
// ===========================================================

import { Request, Response, NextFunction } from 'express';
import { CardService } from '../services/card.service';
import { ScanService } from '../services/scan.service';
import { generateVCard } from '../utils/vcard';
import { AppError } from '../middleware/error.middleware';

export const CardController = {
  /**
   * GET /api/c/:cardId  (also mounted at /api/auth/:cardId for legacy)
   * PUBLIC route — no authentication required.
   * This is the endpoint hit every time someone taps/scans a card.
   *
   * Priority order:
   *   1. UNASSIGNED card → activation message
   *   2. Business card (businessProfileId set) → full menu
   *   3. Personal card (userId set) → personal profile
   */
  async getPublicCard(req: Request, res: Response, next: NextFunction) {
    try {
      const { cardId } = req.params;

      // Single DB query — preloads businessProfile+menus and user.profile+links
      const card = await CardService.getCardByPublicId(cardId);
      const c: any = card; // Bypass stale Prisma types during npm build

      // ----------------------------------------
      // CASE 1: Unassigned card (no owner of any kind)
      // ----------------------------------------
      if (!c.userId && !c.businessProfileId) {
        res.status(200).json({
          success: true,
          data: {
            type: "unassigned",
            cardId: c.cardId,
            message: "This card has not been activated yet.",
          },
        });
        return;
      }

      // Record the scan in background — never blocks response
      ScanService.recordScan(
        c.id,
        req.headers["user-agent"],
        req.ip || req.socket.remoteAddress
      ).catch(() => {}); // scan failure must NEVER break card view

      // ----------------------------------------
      // CASE 2: Business card (NFC tap shows restaurant/hotel menu)
      // businessProfileId links the card to the business
      // businessProfile is already loaded in the query — zero extra DB calls
      // ----------------------------------------
      if (c.businessProfileId && c.businessProfile) {
        res.status(200).json({
          success: true,
          data: {
            type: "business",
            cardId: c.cardId,
            business: c.businessProfile,
          },
        });
        return;
      }

      // ----------------------------------------
      // CASE 3: Personal card (NFC tap shows personal digital card)
      // user.profile is already loaded in the query — zero extra DB calls
      // ----------------------------------------
      if (c.userId && c.user) {
        const profileData = c.user.profile;

        if (!profileData) {
          res.status(200).json({
            success: true,
            data: {
              type: "personal",
              cardId: c.cardId,
              profile: null,
              message: "Profile not set up yet.",
            },
          });
          return;
        }

        // Build safe public view — only expose public fields
        const profile = {
          fullName: profileData.fullName,
          jobTitle: profileData.jobTitle,
          company: profileData.company,
          phone: profileData.phone,
          email: profileData.email,
          website: profileData.website,
          bio: profileData.bio,
          imageUrl: profileData.imageUrl,
          whatsapp: profileData.whatsapp,
          links: profileData.links,
        };

        res.status(200).json({
          success: true,
          data: {
            type: "personal",
            cardId: c.cardId,
            profile,
          },
        });
        return;
      }

      // Fallback: card in unexpected state
      res.status(200).json({
        success: true,
        data: {
          type: "unassigned",
          cardId: c.cardId,
          message: "This card has not been activated yet.",
        },
      });

    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/c/:cardId/vcard
   * PUBLIC route — downloads a .vcf file for "Add to Contacts"
   * Only works for personal cards (business cards have no vCard concept)
   */
  async downloadVCard(req: Request, res: Response, next: NextFunction) {
    try {
      const { cardId } = req.params;
      const card = await CardService.getCardByPublicId(cardId);
      const c: any = card; // Bypass stale Prisma types during npm build

      if (!c.userId || !c.user?.profile) {
        throw new AppError(404, 'No personal profile associated with this card');
      }

      const profileData = c.user.profile;

      // Build the public profile object that generateVCard expects
      const profile = {
        fullName: profileData.fullName,
        jobTitle: profileData.jobTitle,
        company: profileData.company,
        phone: profileData.phone,
        email: profileData.email,
        website: profileData.website,
        bio: profileData.bio,
        imageUrl: profileData.imageUrl,
        whatsapp: profileData.whatsapp,
        links: profileData.links,
      };

      const vcardString = generateVCard(profile as any);

      // Set headers to trigger file download in the browser
      const filename = `${profileData.fullName.replace(/\s+/g, '_')}_contact.vcf`;
      res.setHeader('Content-Type', 'text/vcard; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(vcardString);
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/cards/my
   * PROTECTED — returns all cards belonging to the authenticated user
   */
  async getMyCards(req: Request, res: Response, next: NextFunction) {
    try {
      const cards = await CardService.getUserCards(req.user!.userId);
      res.status(200).json({ success: true, data: cards });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/cards/:cardId/analytics
   * PROTECTED — returns scan analytics for the card owner
   */
  async getCardAnalytics(req: Request, res: Response, next: NextFunction) {
    try {
      const { cardId } = req.params;
      const card = await CardService.getCardByPublicId(cardId);

      // Authorization check: only the card owner (or admin) can view analytics
      if (card.userId !== req.user!.userId && req.user!.role !== 'ADMIN') {
        throw new AppError(403, 'You do not have access to this card\'s analytics');
      }

      const analytics = await ScanService.getCardAnalytics(card.id);
      res.status(200).json({ success: true, data: analytics });
    } catch (error) {
      next(error);
    }
  },
};
