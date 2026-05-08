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
import crypto from "crypto";
import { Card, CardStatus } from "@prisma/client";
import { RegisterBody, LoginBody, JwtPayload } from "../types";
import { AppError } from "../middleware/error.middleware";
import logger from "../utils/logger";
import prisma from "../lib/prisma";
import { sendWelcomeEmail, sendPasswordResetEmail, sendPasswordRecoveredEmail } from "./email.service";

// JWT configuration — token expires in 7 days for good UX
// Short-lived access tokens (15min) + refresh tokens are ideal for high-security apps,
// but 7-day tokens are a pragmatic balance for an MVP
const JWT_EXPIRY = "7d";
const DEFAULT_BUSINESS_CATEGORY = "general";

export const AuthService = {
  /**
   * Register a new user.
   * Optionally activates a card during registration (card ID passed at signup).
   */
  async register(body: RegisterBody) {
    const { name, email, password, cardId, role = "USER" } = body;

    const existingRows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id FROM users WHERE email = $1 LIMIT 1`, email
    );
    if (existingRows[0]) {
      throw new AppError(409, "An account with this email already exists");
    }

    let cardToActivate: Card | null = null;
    if (cardId) {
      cardToActivate = await prisma.card.findUnique({ where: { cardId } });
      if (!cardToActivate) throw new AppError(404, "Card not found. Please check your card ID.");
      if (cardToActivate.status === CardStatus.ACTIVE) throw new AppError(409, "This card is already activated by another user");
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    // Use raw SQL for user creation to avoid WASM enum validation on Role
    const newUserRows = await prisma.$queryRawUnsafe<any[]>(
      `INSERT INTO users (id, name, email, password, role, "createdAt", "updatedAt")
       VALUES (gen_random_uuid()::text, $1, $2, $3, $4, NOW(), NOW())
       RETURNING id, name, email, role`,
      name, email, hashedPassword, role
    );
    const newUser = newUserRows[0];

    await prisma.profile.create({
      data: { userId: newUser.id, fullName: name, email },
    });

    let businessProfileId: string | null = null;
    if (role === "BUSINESS") {
      const bpRows = await prisma.$queryRawUnsafe<any[]>(
        `INSERT INTO business_profiles (id, "userId", name, category, email, "createdAt", "updatedAt")
         VALUES (gen_random_uuid()::text, $1, $2, $3, $4, NOW(), NOW())
         RETURNING id`,
        newUser.id, name, DEFAULT_BUSINESS_CATEGORY, email
      );
      businessProfileId = bpRows[0].id;
    }

    if (cardToActivate) {
      await prisma.card.update({
        where: { id: cardToActivate.id },
        data: {
          userId: newUser.id,
          status: CardStatus.ACTIVE,
          ...(businessProfileId ? { businessProfileId } : {}),
        },
      });
    }

    logger.info("New user registered", { userId: newUser.id, email: newUser.email });

    // Send welcome email — fire and forget (don't block registration if email fails)
    sendWelcomeEmail(newUser.email, newUser.name).catch((err) =>
      logger.warn("Welcome email failed to send", { email: newUser.email, err: err.message }),
    );

    const token = generateToken({ userId: newUser.id, email: newUser.email, role: newUser.role });

    return {
      token,
      user: { id: newUser.id, name: newUser.name, email: newUser.email, role: newUser.role },
    };
  },

  /**
   * Authenticate a user with email and password.
   * Returns a JWT on success.
   */
  async login(body: LoginBody) {
    const { email, password } = body;

    // Fetch user including password hash for comparison
    const userRows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id, name, email, password, role FROM users WHERE email = $1 LIMIT 1`, email
    );
    const user = userRows[0] ?? null;

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
  /**
   * Request a password reset link.
   * Generates a secure token, stores its hash in DB, emails the raw token.
   * Always responds with success to prevent email enumeration.
   */
  async forgotPassword(email: string) {
    const userRows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id, name, email FROM users WHERE email = $1 LIMIT 1`, email
    );
    const user = userRows[0];

    // Always return success — don't reveal whether the email exists
    if (!user) return;

    // Generate a cryptographically secure random token
    const rawToken = crypto.randomBytes(32).toString("hex");

    // Store only the hash — raw token is only ever in the email link
    const hashedToken = crypto.createHash("sha256").update(rawToken).digest("hex");
    const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

    await prisma.$queryRawUnsafe(
      `UPDATE users SET "resetToken" = $1, "resetTokenExpiry" = $2, "updatedAt" = NOW() WHERE id = $3`,
      hashedToken, expiry, user.id
    );

    // Send email with the raw token (not the hash)
    await sendPasswordResetEmail(user.email, user.name, rawToken);

    logger.info("Password reset requested", { userId: user.id });
  },

  /**
   * Reset password using the token from the email link.
   * Validates token hash + expiry, then updates the password.
   */
  async resetPassword(rawToken: string, newPassword: string) {
    // Hash the incoming token to compare against what's stored in DB
    const hashedToken = crypto.createHash("sha256").update(rawToken).digest("hex");

    const userRows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id, name, email, "resetTokenExpiry" FROM users
       WHERE "resetToken" = $1 AND "resetTokenExpiry" > NOW() LIMIT 1`,
      hashedToken
    );
    const user = userRows[0];

    if (!user) {
      throw new AppError(400, "Reset link is invalid or has expired");
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // Update password and clear the reset token so it can't be reused
    await prisma.$queryRawUnsafe(
      `UPDATE users SET password = $1, "resetToken" = NULL, "resetTokenExpiry" = NULL, "updatedAt" = NOW() WHERE id = $2`,
      hashedPassword, user.id
    );

    // Send confirmation email — fire and forget (don't block the response)
    sendPasswordRecoveredEmail(user.email, user.name).catch((err) =>
      logger.warn("Password recovered email failed to send", { email: user.email, err: err.message }),
    );

    logger.info("Password reset successful", { userId: user.id });
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
