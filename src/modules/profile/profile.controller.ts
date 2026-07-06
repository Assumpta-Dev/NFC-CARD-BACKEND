
import { Request, Response, NextFunction } from "express";
import { ProfileService } from "../../services/profile.service";
import { AppError } from "../../middleware/error.middleware";

export const ProfileController = {
  async getMyProfile(_req: Request, res: Response, next: NextFunction) {
    try {
      const profile = await ProfileService.getProfile(_req.user!.userId);
      res.status(200).json({ success: true, data: profile });
    } catch (error) {
      next(error);
    }
  },

  async uploadPhoto(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.file) throw new AppError(400, "No photo file provided");
      const imageUrl = await ProfileService.uploadPhoto(
        req.user!.userId,
        req.file.buffer,
        req.file.mimetype,
      );
      res.status(200).json({ success: true, data: { imageUrl } });
    } catch (error) {
      next(error);
    }
  },

  async uploadCoverPhoto(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.file) throw new AppError(400, "No photo file provided");
      const coverImageUrl = await ProfileService.uploadCoverPhoto(
        req.user!.userId,
        req.file.buffer,
        req.file.mimetype,
      );
      res.status(200).json({ success: true, data: { coverImageUrl } });
    } catch (error) {
      next(error);
    }
  },

  async updateMyProfile(_req: Request, res: Response, next: NextFunction) {
    try {
      const profile = await ProfileService.updateProfile(
        _req.user!.userId,
        _req.body,
      );
      res.status(200).json({
        success: true,
        data: profile,
        message: "Profile updated successfully",
      });
    } catch (error) {
      next(error);
    }
  },
};
