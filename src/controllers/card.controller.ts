// ===========================================================
// CARD CONTROLLER
// ===========================================================
// Handles all card-related HTTP operations.
// The public card view route (GET /api/cards/:cardId) is the
// most critical — it's hit on every NFC tap / QR scan.
// It must be fast (<2s) and requires NO authentication.
// ===========================================================

import { Request, Response, NextFunction } from 'express';
import { CardService } from '../services/card.service';
import { ProfileService } from '../services/profile.service';
import { ScanService } from '../services/scan.service';
import { generateVCard } from '../utils/vcard';
import { CardStatus } from '../types';
import { AppError } from '../middleware/error.middleware';

export const CardController = {
  /**
   * GET /api/cards/:cardId
   * PUBLIC route — no authentication required.
   * This is the endpoint hit every time someone taps/scans a card.
   * Returns the card status and public profile (if active).
   *
   * Response shape varies by card status:
   *   - active: full profile data
   *   - unassigned: activation prompt
   *   - not found: 404
   */
  async getPublicCard(req: Request, res: Response, next: NextFunction) {
    try {
      const { cardId } = req.params;
      const card = await CardService.getCardByPublicId(cardId);

      // Edge case: Card exists but is not yet activated
      if (card.status === CardStatus.UNASSIGNED || !card.userId) {
        res.status(200).json({
          success: true,
          data: {
            status: 'unassigned',
            cardId: card.cardId,
            message: 'This card has not been activated yet. Scan to claim it!',
          },
        });
        return;
      }

      // Card is active — fetch public profile and record the scan
      // Profile fetch and scan recording run in parallel for speed
      const [profile] = await Promise.all([
        ProfileService.getPublicProfile(card.userId),
        // Record scan asynchronously — failure won't affect the response
        ScanService.recordScan(
          card.id,
          req.headers['user-agent'],
          req.ip || req.socket.remoteAddress
        ),
      ]);

      res.status(200).json({
        success: true,
        data: {
          status: 'active',
          cardId: card.cardId,
          profile,
        },
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/cards/:cardId/vcard
   * PUBLIC route — downloads a .vcf file for "Add to Contacts"
   * Sets Content-Disposition header so the browser triggers download
   */
  async downloadVCard(req: Request, res: Response, next: NextFunction) {
    try {
      const { cardId } = req.params;
      const card = await CardService.getCardByPublicId(cardId);

      if (!card.userId) {
        throw new AppError(404, 'No profile associated with this card');
      }

      const profile = await ProfileService.getPublicProfile(card.userId);
      const vcardString = generateVCard(profile);

      // Set headers to trigger file download in the browser
      // The filename uses the person's name for a professional touch
      const filename = `${profile.fullName.replace(/\s+/g, '_')}_contact.vcf`;
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

      // Authorization check: only the card owner can view analytics
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
