
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { JwtPayload, Role } from '../types';
import logger from '../utils/logger';
 
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ success: false, error: 'Authorization token required' });
      return;
    }

    const token = authHeader.split(' ')[1];
    const secret = process.env.JWT_SECRET;

    if (!secret) {
      logger.error('JWT_SECRET environment variable is not set');
      res.status(500).json({ success: false, error: 'Server configuration error' });
      return;
    }

    const decoded = jwt.verify(token, secret) as JwtPayload;

    req.user = decoded;

    next();
  } catch (error) {
    logger.warn('Invalid or expired JWT token', { error });
    res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user || req.user.role !== Role.ADMIN) {
    logger.warn('Non-admin user attempted to access admin route', {
      userId: req.user?.userId,
      route: req.path,
    });
    res.status(403).json({ success: false, error: 'Admin access required' });
    return;
  }

  next();
}

export function requireBusiness(req: Request, res: Response, next: NextFunction): void {
  if (!req.user || (req.user.role !== Role.BUSINESS && req.user.role !== Role.ADMIN)) {
    logger.warn('Non-business user attempted to access business route', {
      userId: req.user?.userId,
      role: req.user?.role,
      route: req.path,
    });
    res.status(403).json({ success: false, error: 'Business account required' });
    return;
  }

  next();
}

/** Owner, staff order portal, or admin */
export function requireBusinessOrStaff(req: Request, res: Response, next: NextFunction): void {
  const role = req.user?.role as string | undefined;
  const allowed = role === "BUSINESS" || role === "ADMIN" || role === "STAFF";
  if (!req.user || !allowed) {
    logger.warn("Non-business/staff user attempted to access order portal", {
      userId: req.user?.userId,
      role: req.user?.role,
      route: req.path,
    });
    res.status(403).json({ success: false, error: "Business or staff access required" });
    return;
  }

  next();
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const secret = process.env.JWT_SECRET!;
      req.user = jwt.verify(token, secret) as JwtPayload;
    }
  } catch {
    req.user = undefined;
  }
  next();
}
