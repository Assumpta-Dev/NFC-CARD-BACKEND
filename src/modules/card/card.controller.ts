
import { Request, Response, NextFunction } from 'express';
import { CardService } from '../../services/card.service';
import { ScanService } from '../../services/scan.service';
import { generateVCard } from '../../utils/vcard';
import { AppError } from '../../middleware/error.middleware';

export const CardController = {
  async getPublicCard(req: Request, res: Response, next: NextFunction) {
    try {
      const { cardId } = req.params;

      const card = await CardService.getCardByPublicId(cardId);
      const c: any = card;
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

      ScanService.recordScan(
        c.id,
        req.headers["user-agent"],
        req.ip || req.socket.remoteAddress
      ).catch(() => {});

      // ----------------------------------------
      // ----------------------------------------
      if (c.businessProfileId && c.businessProfile) {
        const bp = c.businessProfile;
        const ownerProfile = bp.user?.profile;
        res.status(200).json({
          success: true,
          data: {
            type: "business",
            cardId: c.cardId,
            business: {
              id: bp.id,
              name: bp.name,
              businessType: bp.businessType,
              category: bp.category,
              description: bp.description ?? null,
              location: bp.location ?? null,
              phone: bp.phone ?? null,
              email: bp.email ?? null,
              website: bp.website ?? null,
              imageUrl: bp.imageUrl ?? null,
              paymentCode: bp.paymentCode ?? null,
              settings: bp.settings ?? null,
              menus: bp.menus ?? [],
              whatsapp: ownerProfile?.whatsapp ?? null,
              links: (ownerProfile?.links ?? []).map((l: any) => ({
                id: l.id,
                type: l.type?.toLowerCase() ?? 'custom',
                label: l.label,
                url: l.url,
                order: l.order,
              })),
            },
          },
        });
        return;
      }

      // ----------------------------------------
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

        const profile = {
          fullName: profileData.fullName,
          jobTitle: profileData.jobTitle,
          company: profileData.company,
          phone: profileData.phone,
          email: profileData.email,
          website: profileData.website,
          bio: profileData.bio,
          imageUrl: profileData.imageUrl,
          coverImageUrl: profileData.coverImageUrl ?? null,
          whatsapp: profileData.whatsapp,
          links: (profileData.links ?? []).map((l: any) => ({
            id: l.id,
            type: l.type?.toLowerCase() ?? 'custom',
            label: l.label,
            url: l.url,
            order: l.order,
          })),
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
   */
  async downloadVCard(req: Request, res: Response, next: NextFunction) {
    try {
      const { cardId } = req.params;
      const card = await CardService.getCardByPublicId(cardId);
      const c: any = card;

      if (!c.userId || !c.user?.profile) {
        throw new AppError(404, 'No personal profile associated with this card');
      }

      const profileData = c.user.profile;

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
