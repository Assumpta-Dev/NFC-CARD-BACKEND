// ===========================================================
// AUTH SERVICE
// ===========================================================
// Contains the business logic for user registration and login.
// Services are separate from controllers so that:
//   - Logic is testable without HTTP context
//   - Controllers stay thin (just parse request → call service → send response)
//   - Logic can be reused across multiple routes or jobs
// ===========================================================

import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { Card, CardStatus } from "@prisma/client";
import { RegisterBody, LoginBody, JwtPayload } from "../types";
import { AppError } from "../middleware/error.middleware";
import logger from "../utils/logger";
import prisma from "../lib/prisma";

// JWT configuration — token expires in 7 days for good UX
// Short-lived access tokens (15min) + refresh tokens are ideal for high-security apps,
// but 7-day tokens are a pragmatic balance for an MVP
const JWT_EXPIRY = "7d";

export const AuthService = {
  /**
   * Register a new user.
   * Optionally activates a card during registration (card ID passed at signup).
   */
  async register(body: RegisterBody) {
    const { name, email, password, cardId } = body;

    // ----------------------------------------------------------
    // Check if email is already registered
    // We check manually here (rather than relying on DB unique error)
    // to provide a friendly, specific error message
    // ----------------------------------------------------------
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      throw new AppError(409, "An account with this email already exists");
    }

    // ----------------------------------------------------------
    // If a cardId is provided, validate it before creating user
    // This prevents orphaned users if the card ID is invalid
    // ----------------------------------------------------------
    let cardToActivate: Card | null = null;
    if (cardId) {
      cardToActivate = await prisma.card.findUnique({ where: { cardId } });
      if (!cardToActivate) {
        throw new AppError(404, "Card not found. Please check your card ID.");
      }
      if (cardToActivate.status === CardStatus.ACTIVE) {
        throw new AppError(
          409,
          "This card is already activated by another user",
        );
      }
    }

    // ----------------------------------------------------------
    // Hash password before storing
    // 12 salt rounds: strong security while staying under ~400ms
    // Never store plaintext passwords
    // ----------------------------------------------------------
    const hashedPassword = await bcrypt.hash(password, 12);

    // ----------------------------------------------------------
    // Create user (and optionally link card) in a single transaction
    // Transactions ensure atomicity: either both succeed or neither does
    // ----------------------------------------------------------
    const user = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: { name, email, password: hashedPassword },
      });

      // Create a basic profile automatically on registration
      await tx.profile.create({
        data: {
          userId: newUser.id,
          fullName: name,
          email: email,
        },
      });

      // Activate card if one was provided
      if (cardToActivate) {
        await tx.card.update({
          where: { id: cardToActivate.id },
          data: { userId: newUser.id, status: CardStatus.ACTIVE },
        });
      }

      return newUser;
    });

    logger.info("New user registered", { userId: user.id, email: user.email });

    // Generate JWT for immediate login after registration
    const token = generateToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    return {
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    };
  },

  /**
   * Authenticate a user with email and password.
   * Returns a JWT on success.
   */
  async login(body: LoginBody) {
    const { email, password } = body;

    // Fetch user including password hash for comparison
    const user = await prisma.user.findUnique({ where: { email } });

    // Use a constant-time comparison to avoid timing attacks
    // Even if user doesn't exist, we still run bcrypt.compare to prevent
    // timing-based user enumeration (takes same time whether user exists or not)
    // Use a real bcrypt hash here because bcrypt.compare can throw on malformed hashes,
    // which would turn an ordinary "user not found" case into an unexpected 500.
    const dummyHash =
      "$2a$12$3euPcmQFCiblsZeEu5s7p.9OFC1JxB/hb7naWsyDmcHfA7F0WqG7K";
    const isValid = user
      ? await bcrypt.compare(password, user.password)
      : await bcrypt.compare(password, dummyHash).then(() => false);

    if (!user || !isValid) {
      // Generic message: don't reveal whether the email exists
      throw new AppError(401, "Invalid email or password");
    }

    logger.info("User logged in", { userId: user.id });

    const token = generateToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    return {
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    };
  },
};

/**
 * Generates a signed JWT for the given payload.
 * Kept private to this module — only auth service issues tokens.
 */
function generateToken(payload: JwtPayload): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not configured");

  return jwt.sign(payload, secret, { expiresIn: JWT_EXPIRY });
}
