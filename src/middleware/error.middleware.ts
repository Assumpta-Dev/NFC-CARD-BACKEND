// ===========================================================
// GLOBAL ERROR HANDLING MIDDLEWARE
// ===========================================================
// Express processes errors through a special 4-argument middleware
// (err, req, res, next). All controllers call next(err) to route
// errors here, ensuring:
//   - One centralized place for error formatting
//   - Stack traces never leak to clients in production
//   - All errors are logged with full context for debugging
//   - Consistent JSON error shape across the entire API
// ===========================================================

import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import logger from '../utils/logger';

// Custom error class that carries an HTTP status code
// Controllers throw this for predictable, expected errors
export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string
  ) {
    super(message);
    this.name = 'AppError';
    // Restore prototype chain (TypeScript limitation with Error subclassing)
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

/**
 * Global error handler — must be registered LAST with app.use()
 * so that it receives errors forwarded via next(err) from all routes.
 */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction // Must declare 4 params or Express won't treat it as error middleware
): void {
  // ----------------------------------------------------------
  // Known application errors (thrown intentionally by controllers)
  // ----------------------------------------------------------
  if (err instanceof AppError) {
    logger.warn('Application error', {
      statusCode: err.statusCode,
      message: err.message,
      path: req.path,
      method: req.method,
    });

    res.status(err.statusCode).json({
      success: false,
      error: err.message,
    });
    return;
  }

  // ----------------------------------------------------------
  // Prisma unique constraint violations (e.g. duplicate email)
  // Map these to 409 Conflict with a friendly message
  // ----------------------------------------------------------
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    const prismaErr = err as Prisma.PrismaClientKnownRequestError;
    if (prismaErr.code === 'P2002') {
      // P2002 = Unique constraint failed
      // meta.target contains the field(s) that violated uniqueness
      const fields = (prismaErr.meta?.target as string[]) || ['field'];
      res.status(409).json({
        success: false,
        error: `A record with this ${fields.join(', ')} already exists`,
      });
      return;
    }

    if (prismaErr.code === 'P2025') {
      // P2025 = Record not found (e.g. update/delete on non-existent ID)
      res.status(404).json({
        success: false,
        error: 'Record not found',
      });
      return;
    }
  }

  // ----------------------------------------------------------
  // Unexpected errors — log full details server-side,
  // return generic message to client (never expose stack traces)
  // ----------------------------------------------------------
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  logger.error('Unhandled server error', {
    error: message,
    stack,
    path: req.path,
    method: req.method,
    userId: req.user?.userId,
  });

 res.status(500).json({
  success: false,
  error: message, // 👈 SHOW REAL ERROR
});
}

/**
 * 404 handler — catches requests to routes that don't exist.
 * Register this AFTER all routes but BEFORE the error handler.
 */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    error: `Route ${req.method} ${req.path} not found`,
  });
}
