// ===========================================================
// VALIDATION MIDDLEWARE (Zod)
// ===========================================================
// Zod is used for input validation because:
//   - TypeScript-native: infers types directly from schemas
//   - Declarative: schemas are readable and self-documenting
//   - Safe parsing: safeParse() never throws; errors are returned
//
// All schemas are defined here so they can be reused across
// controllers and are easy to audit in one place.
//
// The validate() factory creates a reusable middleware from any Zod schema.
// ===========================================================

import { Request, Response, NextFunction } from "express";
import { z, ZodSchema } from "zod";

// ===========================================================
// VALIDATION SCHEMAS
// Each schema defines the exact shape and constraints for a
// particular request body. Invalid data is rejected with 400.
// ===========================================================

// Password rules: min 8 chars, must include a digit
// Using regex for digit check — simpler than custom refinement
const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .regex(/\d/, "Password must contain at least one number");

export const RegisterSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(100),
  email: z.string().email("Invalid email format"),
  password: passwordSchema,
  cardId: z.string().optional(), // Optional card ID for activation at signup
});

export const LoginSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string().min(1, "Password is required"),
});

export const UpdateProfileSchema = z.object({
  fullName: z.string().min(2).max(100).optional(),
  jobTitle: z.string().max(100).optional().nullable(),
  company: z.string().max(100).optional().nullable(),
  phone: z.string().max(30).optional().nullable(),
  email: z.string().email().optional().nullable(),
  website: z.string().url("Invalid URL format").optional().nullable(),
  bio: z.string().max(500).optional().nullable(),
  imageUrl: z.string().url().optional().nullable(),
  whatsapp: z
    .string()
    .regex(/^\d+$/, "WhatsApp number must contain only digits")
    .optional()
    .nullable(),
  links: z
    .array(
      z.object({
        type: z.string().min(1).max(50),
        label: z.string().min(1).max(100),
        url: z.string().url("Each link must be a valid URL"),
        order: z.number().int().min(0).optional(),
      }),
    )
    .max(10, "Maximum 10 links allowed") // Prevent abuse — too many links breaks UI
    .optional(),
});

// Admin schema for creating new physical cards in batch
export const CreateCardSchema = z.object({
  count: z.number().int().min(1).max(100).optional().default(1),
});

// Admin schema for assigning a card to a user
export const AssignCardSchema = z.object({
  userId: z.string().min(1, "User ID is required"),
});

// ===========================================================
// MIDDLEWARE FACTORY
// Returns an Express middleware that validates req.body
// against the given Zod schema.
//
// Usage:
//   router.post('/register', validate(RegisterSchema), authController.register)
// ===========================================================
export function validate<T extends ZodSchema>(schema: T) {
  return (req: Request, res: Response, next: NextFunction): void => {
    // safeParse never throws — it returns { success, data } or { success, error }
    const result = schema.safeParse(req.body);

    if (!result.success) {
      // flatten() converts Zod's nested error structure into a simple field → message map
      // This is easy for the frontend to display inline validation errors
      res.status(400).json({
        success: false,
        error: "Validation failed",
        details: result.error.flatten().fieldErrors,
      });
      return;
    }

    // Replace req.body with the parsed (and possibly transformed) data
    // This ensures downstream code works with clean, typed data
    req.body = result.data;

    next();
  };
}
