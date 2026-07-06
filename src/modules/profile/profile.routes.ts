import { Router } from "express";
import { ProfileController } from "./profile.controller";
import { requireAuth } from "../../middleware/auth.middleware";
import { validate, UpdateProfileSchema } from "../../middleware/validate.middleware";
import { uploadPhoto } from "../../middleware/upload.middleware";

export const profileRouter = Router();

profileRouter.use(requireAuth);

profileRouter.post("/photo", uploadPhoto, ProfileController.uploadPhoto);
profileRouter.post("/cover", uploadPhoto, ProfileController.uploadCoverPhoto);
profileRouter.get("/", ProfileController.getMyProfile);
profileRouter.put(
  "/",
  validate(UpdateProfileSchema),
  ProfileController.updateMyProfile,
);
