
import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../../services/auth.service';

export const AuthController = {
  async register(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await AuthService.register(req.body);

      res.status(201).json({
        success: true,
        data: result,
        message: 'Account created successfully',
      });
    } catch (error) {
      next(error);
    }
  },

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

  async me(req: Request, res: Response) {
    res.status(200).json({
      success: true,
      data: { user: req.user },
    });
  },
  async forgotPassword(req: Request, res: Response, next: NextFunction) {
    try {
      await AuthService.forgotPassword(req.body.email);
      res.status(200).json({
        success: true,
        message: 'If that email is registered, a reset link has been sent.',
      });
    } catch (error) {
      next(error);
    }
  },

  async resetPassword(req: Request, res: Response, next: NextFunction) {
    try {
      const { token, password } = req.body;
      await AuthService.resetPassword(token, password);
      res.status(200).json({
        success: true,
        message: 'Password reset successfully. You can now log in.',
      });
    } catch (error) {
      next(error);
    }
  },
};
