
import { Request, Response, NextFunction } from "express";
import { z, ZodSchema } from "zod";
const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .regex(/\d/, "Password must contain at least one number");

export const RegisterSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(100),
  email: z.string().email("Invalid email format"),
  password: passwordSchema,
  role: z.enum(["USER", "BUSINESS"]).optional().default("USER"),
  cardId: z.string().optional(),
});

export const LoginSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string().min(1, "Password is required"),
});

const optionalString = (maxLen?: number) =>
  z.union([z.string().max(maxLen ?? 500), z.null(), z.undefined()])
    .transform(v => (v === undefined || v === null || (typeof v === "string" && v.trim() === "")) ? null : (v as string).trim());

export const UpdateProfileSchema = z.object({
  fullName:  z.string().min(1).max(100).optional(),
  jobTitle:  optionalString(100),
  company:   optionalString(100),
  phone:     optionalString(30),
  email:     optionalString(200),
  website:   optionalString(500),
  bio:       optionalString(500),
  imageUrl:  optionalString(1000),
  whatsapp:  z.union([z.string().regex(/^\d*$/, "WhatsApp must be digits only").max(20), z.null(), z.undefined()])
               .transform(v => (!v || v.trim() === "") ? null : v.trim()),
  links: z
    .array(
      z.object({
        type:  z.string().min(1).max(50),
        label: z.string().min(1).max(100),
        url:   z.string().url("Each link must be a valid URL"),
        order: z.number().int().min(0).optional(),
      }),
    )
    .max(10)
    .optional(),
});

export const ForgotPasswordSchema = z.object({
  email: z.string().email("Invalid email format"),
});

export const ResetPasswordSchema = z.object({
  token: z.string().min(1, "Token is required"),
  password: passwordSchema,
});

export const CreateCardSchema = z.object({
  count: z.number().int().min(1).max(100).optional().default(1),
});

export const AssignCardSchema = z.object({
  userId: z.string().min(1, "User ID is required"),
});

export function validate<T extends ZodSchema>(schema: T) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      res.status(400).json({
        success: false,
        error: "Validation failed",
        details: result.error.flatten().fieldErrors,
      });
      return;
    }

    req.body = result.data;

    next();
  };
}
