
import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import logger from '../utils/logger';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string
  ) {
    super(message);
    this.name = 'AppError';
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
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

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    const prismaErr = err as Prisma.PrismaClientKnownRequestError;
    if (prismaErr.code === 'P2002') {
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
  error: message,
});
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    error: `Route ${req.method} ${req.path} not found`,
  });
}
