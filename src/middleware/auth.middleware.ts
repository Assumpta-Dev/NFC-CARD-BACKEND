// ===========================================================
// AUTH MIDDLEWARE
// ===========================================================
// Sits in front of protected routes and validates the JWT.
// If the token is valid, it decodes the payload and attaches
// it to req.user so downstream controllers know who is calling.
//
// Using middleware (not inline checks) because:
//   - DRY: One place to update auth logic
//   - Composable: Can combine requireAuth + requireAdmin
//   - Testable: Can mock req.user in unit tests
// ===========================================================

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { JwtPayload, Role } from '../types';
import logger from '../utils/logger';

/**
 * requireAuth — protects routes that need a valid logged-in user.
 * Reads the JWT from the Authorization header (Bearer token scheme).
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  try {
    // Extract token from "Authorization: Bearer <token>" header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ success: false, error: 'Authorization token required' });
      return;
    }

    const token = authHeader.split(' ')[1];
    const secret = process.env.JWT_SECRET;

    if (!secret) {
      // This is a server configuration error — should never happen in production
      logger.error('JWT_SECRET environment variable is not set');
      res.status(500).json({ success: false, error: 'Server configuration error' });
      return;
    }

    // jwt.verify throws on invalid/expired tokens, which we catch below
    // It returns the decoded payload if valid
    const decoded = jwt.verify(token, secret) as JwtPayload;

    // Attach decoded payload to request — controllers can now read req.user
    req.user = decoded;

    next(); // Token valid — allow request to continue to the controller
  } catch (error) {
    // TokenExpiredError and JsonWebTokenError are both caught here
    // We return 401 for both — client must re-authenticate
    logger.warn('Invalid or expired JWT token', { error });
    res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }
}

/**
 * requireAdmin — extends requireAuth with an ADMIN role check.
 * Must be used AFTER requireAuth in the middleware chain:
 *   router.get('/admin/users', requireAuth, requireAdmin, controller)
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  // At this point requireAuth has already verified the JWT
  // We just need to check the role from the decoded payload
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

/**
 * requireBusiness — allows access to BUSINESS users and ADMIN (full power).
 * Must be used AFTER requireAuth in the middleware chain.
 */
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

/**
 * optionalAuth — attaches user if token present, but doesn't block if absent.
 * Used for routes that behave differently for logged-in vs anonymous users.
 */
export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const secret = process.env.JWT_SECRET!;
      req.user = jwt.verify(token, secret) as JwtPayload;
    }
  } catch {
    // Token invalid or expired — treat as anonymous. Do not block request.
    req.user = undefined;
  }
  next();
}
