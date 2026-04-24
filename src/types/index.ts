// ===========================================================
// SHARED TYPESCRIPT TYPES & INTERFACES
// ===========================================================
// Centralizing types here prevents duplication across controllers,
// services, and middleware. It also makes refactoring safer since
// there is a single source of truth for data shapes.
// ===========================================================

import { Role, CardStatus } from '@prisma/client';

// Re-export Prisma enums so other files import from one place
export { Role, CardStatus };

// ===========================================================
// JWT PAYLOAD
// The data encoded inside the JWT token.
// Kept minimal — only what middleware needs to identify a user.
// Heavy data (name, email) is fetched from DB when needed.
// ===========================================================
export interface JwtPayload {
  userId: string;
  email: string;
  role: Role;
}

// ===========================================================
// REQUEST BODY TYPES (Zod validates these at the API boundary)
// Defined here so controllers and services share the same shape
// ===========================================================

export interface RegisterBody {
  name: string;
  email: string;
  password: string;
  role?: "USER" | "BUSINESS";
  cardId?: string; // Optional: user may activate a card at registration
}

export interface LoginBody {
  email: string;
  password: string;
}

export interface UpdateProfileBody {
  fullName?: string;
  jobTitle?: string;
  company?: string;
  phone?: string;
  email?: string;
  website?: string;
  bio?: string;
  imageUrl?: string;
  whatsapp?: string;
  links?: LinkBody[];
}

export interface LinkBody {
  type: string;   // e.g. "instagram", "linkedin"
  label: string;  // Display text
  url: string;    // Full URL
  order?: number;
}

// ===========================================================
// RESPONSE TYPES
// Standardized response shapes ensure the frontend
// always knows what structure to expect from the API.
// ===========================================================

// Wraps all successful API responses in a consistent envelope
export interface ApiResponse<T = unknown> {
  success: boolean;
  data: T;
  message?: string;
}

// Wraps all error responses
export interface ApiError {
  success: false;
  error: string;
  details?: unknown; // Zod validation errors, etc.
}

// Analytics summary for the user dashboard
export interface ScanAnalytics {
  totalScans: number;
  scansToday: number;
  scansThisWeek: number;
  dailyBreakdown: DailyScanCount[]; // For the activity chart
  deviceBreakdown: {
    mobile: number;
    desktop: number;
  };
}

export interface DailyScanCount {
  date: string;  // ISO date string "YYYY-MM-DD"
  count: number;
}

// Public profile view (returned to anyone who scans the card)
// Does NOT include userId or any internal IDs
export interface PublicProfile {
  fullName: string;
  jobTitle: string | null;
  company: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  bio: string | null;
  imageUrl: string | null;
  whatsapp: string | null;
  links: PublicLink[];
}

export interface PublicLink {
  type: string;
  label: string;
  url: string;
  order: number;
}

// ===========================================================
// EXPRESS AUGMENTATION
// Extends Express's Request type to include the authenticated
// user after the auth middleware has verified the JWT.
// This avoids casting req.user everywhere in controllers.
// ===========================================================
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}
