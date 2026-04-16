// ===========================================================
// AUTH CONTROLLER
// ===========================================================
// Controllers are thin: they parse the request, call the service,
// and return the response. Business logic lives in the service.
// This pattern keeps controllers testable and services reusable.
// ===========================================================

import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth.service';

export const AuthController = {
  /**
   * POST /api/auth/register
   * Creates a new user account (optionally activates a card).
   */
  async register(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await AuthService.register(req.body);

      // 201 Created — standard HTTP response for resource creation
      res.status(201).json({
        success: true,
        data: result,
        message: 'Account created successfully',
      });
    } catch (error) {
      next(error); // Forward to global error handler
    }
  },

  /**
   * POST /api/auth/login
   * Authenticates user, returns JWT token.
   */
  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await AuthService.login(req.body);

      res.status(200).json({
        success: true,
        data: result,
        message: 'Login successful',
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/auth/me
   * Returns the currently authenticated user's info.
   * req.user is set by the requireAuth middleware.
   */
  async me(req: Request, res: Response) {
    // req.user is guaranteed to exist here because requireAuth ran first
    res.status(200).json({
      success: true,
      data: { user: req.user },
    });
  },
};
