
import { Card, CardStatus } from '@prisma/client';
import { AppError } from '../middleware/error.middleware';
import logger from '../utils/logger';
import prisma from "../lib/prisma";
  
const CARD_ID_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CARD_ID_LENGTH = 6;

interface ActivateCardOptions {
  businessProfileId?: string;
}

export const CardService = {
  async getCardByPublicId(cardId: string) {
    const card = await prisma.card.findUnique({
      where: { cardId },
      include: {
        user: {
          include: {
            profile: {
              include: {
                links: { orderBy: { order: 'asc' } },
              },
            },
          },
        },
        businessProfile: {
          include: {
            menus: {
              include: {
                items: { orderBy: { createdAt: 'asc' } },
              },
              orderBy: { createdAt: 'asc' },
            },
            user: {
              include: {
                profile: {
                  include: {
                    links: { orderBy: { order: 'asc' } },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!card) {
      throw new AppError(404, 'Card not found');
    }

    return card;
  },

  async getUserCards(userId: string) {
    return prisma.card.findMany({
      where: { userId },
      include: {
        _count: { select: { scans: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  },

  async createCards(count: number = 1) {
    const createdCards: Card[] = [];

    for (let i = 0; i < count; i++) {
      let cardId: string;
      let attempts = 0;

      do {
        cardId = generateCardId();
        attempts++;
        if (attempts > 10) {
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

function generateCardId(): string {
  let id = 'CARD_';
  for (let i = 0; i < CARD_ID_LENGTH; i++) {
    id += CARD_ID_CHARS[Math.floor(Math.random() * CARD_ID_CHARS.length)];
  }
  return id;
}
