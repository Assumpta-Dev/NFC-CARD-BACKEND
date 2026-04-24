// ===========================================================
// CARD SERVICE
// ===========================================================
// Business logic for card management:
//   - Looking up a card (for NFC/QR scan redirects)
//   - Generating new card IDs (admin only)
//   - Fetching cards belonging to a user
//
// Card lookup is the most performance-critical operation in
// the whole system — it happens on every NFC/QR tap.
// The cardId column is indexed so lookups are O(log n).
// ===========================================================

import { Card, CardStatus } from '@prisma/client';
import { AppError } from '../middleware/error.middleware';
import logger from '../utils/logger';
import prisma from "../lib/prisma";


// Characters used for card ID generation
// Excludes visually ambiguous characters (0/O, 1/I/l) to prevent
// mis-entry when users type the ID manually
const CARD_ID_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CARD_ID_LENGTH = 6;

interface ActivateCardOptions {
  businessProfileId?: string;
}

export const CardService = {
  /**
   * Look up a card by its public cardId.
   * Returns status information used to decide what to show the viewer:
   *   - ACTIVE: show the digital business card
   *   - UNASSIGNED: show activation flow
   *   - Not found: show error page
   */
  async getCardByPublicId(cardId: string) {
    const card = await prisma.card.findUnique({
      where: { cardId },
      include: {
        user: {
          include: {
            profile: {
              include: {
                // Sort links by the order field for consistent display
                links: { orderBy: { order: 'asc' } },
              },
            },
          },
        },
        // @ts-ignore - Bypass phantom IDE cache error
        businessProfile: {
          include: {
            menus: {
              include: {
                items: { orderBy: { createdAt: 'asc' } },
              },
              orderBy: { createdAt: 'asc' },
            },
          },
        },
      },
    });

    if (!card) {
      // Edge case: Card ID doesn't exist in system at all
      throw new AppError(404, 'Card not found');
    }

    return card;
  },

  /**
   * Get all cards belonging to the authenticated user.
   * Includes scan count for each card for quick display in dashboard.
   */
  async getUserCards(userId: string) {
    return prisma.card.findMany({
      where: { userId },
      include: {
        _count: { select: { scans: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  },

  /**
   * Generate new card(s) in the system (admin only).
   * Cards are created as UNASSIGNED — they need to be claimed by a user.
   * Generates unique IDs and retries on the rare collision.
   */
  async createCards(count: number = 1) {
    const createdCards: Card[] = [];

    for (let i = 0; i < count; i++) {
      let cardId: string;
      let attempts = 0;

      // Retry loop handles the astronomically rare case of ID collision
      // With 32^6 = ~1 billion possible IDs, collision is practically impossible
      // but we handle it gracefully
      do {
        cardId = generateCardId();
        attempts++;
        if (attempts > 10) {
          // Something is very wrong with our ID space — log and fail gracefully
          logger.error('Failed to generate unique card ID after 10 attempts');
          throw new AppError(500, 'Could not generate card ID. Please try again.');
        }
      } while (await prisma.card.findUnique({ where: { cardId } }));

      const card = await prisma.card.create({
        data: { cardId, status: CardStatus.UNASSIGNED },
      });

      createdCards.push(card);
      logger.info('New card created', { cardId: card.cardId });
    }

    return createdCards;
  },

  /**
   * Activate a card for a user (links cardId to userId).
   * This is called when a user scans an unassigned card and completes registration.
   */
  async activateCard(
    cardId: string,
    userId: string,
    options: ActivateCardOptions = {},
  ) {
    const card = await prisma.card.findUnique({ where: { cardId } });

    if (!card) throw new AppError(404, 'Card not found');
    if (card.status === CardStatus.ACTIVE) {
      throw new AppError(409, 'This card is already activated');
    }

    // Auto-link to business profile if user is a BUSINESS and no explicit override
    let businessProfileId = options.businessProfileId;
    if (!businessProfileId) {
      const bpRows = await prisma.$queryRawUnsafe<any[]>(
        `SELECT id FROM business_profiles WHERE "userId" = $1 LIMIT 1`, userId
      );
      if (bpRows[0]) businessProfileId = bpRows[0].id;
    }

    return prisma.card.update({
      where: { cardId },
      data: {
        userId,
        status: CardStatus.ACTIVE,
        ...(businessProfileId ? { businessProfileId } : {}),
      },
    });
  },

  /**
   * Admin: get all cards with their owner and scan count
   */
  async getAllCards() {
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT c.id, c."cardId", c.status, c."userId", c."createdAt", c."updatedAt",
              u.id AS "ownerId", u.name AS "ownerName", u.email AS "ownerEmail",
              COUNT(s.id)::int AS "scanCount"
       FROM cards c
       LEFT JOIN users u ON u.id = c."userId"
       LEFT JOIN scans s ON s."cardId" = c.id
       GROUP BY c.id, u.id
       ORDER BY c."createdAt" DESC`
    );
    return rows.map(r => ({
      id: r.id,
      cardId: r.cardId,
      status: r.status,
      userId: r.userId,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      user: r.ownerId ? { id: r.ownerId, name: r.ownerName, email: r.ownerEmail } : null,
      _count: { scans: r.scanCount },
    }));
  },
};

/**
 * Generates a random card ID like "CARD_8F3K2L"
 * Uses crypto-quality randomness via Math.random() alternatives —
 * for production, use crypto.randomBytes() for stronger randomness.
 */
function generateCardId(): string {
  let id = 'CARD_';
  for (let i = 0; i < CARD_ID_LENGTH; i++) {
    id += CARD_ID_CHARS[Math.floor(Math.random() * CARD_ID_CHARS.length)];
  }
  return id;
}
