
import { Role, CardStatus } from '@prisma/client';
export { Role, CardStatus };

export interface JwtPayload {
  userId: string;
  email: string;
  role: Role;
}

export interface RegisterBody {
  name: string;
  email: string;
  password: string;
  role?: "USER" | "BUSINESS";
  cardId?: string; 
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
  type: string;
  label: string;
  url: string;
  order?: number;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data: T;
  message?: string;
}

export interface ApiError {
  success: false;
  error: string;
  details?: unknown;
}

export interface ScanAnalytics {
  totalScans: number;
  scansToday: number;
  scansThisWeek: number;
  dailyBreakdown: DailyScanCount[];
  deviceBreakdown: {
    mobile: number;
    desktop: number;
  };
}

export interface DailyScanCount {
  date: string;
  count: number;
}

export interface PublicProfile {
  fullName: string;
  jobTitle: string | null;
  company: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  bio: string | null;
  imageUrl: string | null;
  coverImageUrl: string | null;
  whatsapp: string | null;
  links: PublicLink[];
}

export interface PublicLink {
  type: string;
  label: string;
  url: string;
  order: number;
}

declare global {
  namespace Express {
    namespace Multer {
      interface File {
        fieldname: string;
        originalname: string;
        encoding: string;
        mimetype: string;
        size: number;
        buffer: Buffer;
        destination: string;
        filename: string;
        path: string;
      }
    }
    interface Request {
      user?: JwtPayload;
      file?: Express.Multer.File;
      files?: Express.Multer.File[] | { [fieldname: string]: Express.Multer.File[] };
    }
  }
}
