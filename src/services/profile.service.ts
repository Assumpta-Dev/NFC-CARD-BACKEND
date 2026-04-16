// ===========================================================
// PROFILE SERVICE
// ===========================================================
// Manages user profile data — the content shown on the digital card.
// Profile updates use a transaction that replaces all links atomically:
//   1. Delete existing links
//   2. Insert new links
// This is simpler than diffing and updating individual links,
// and avoids stale link data if a user reorders or removes items.
// ===========================================================

import { UpdateProfileBody, PublicProfile } from "../types";
import { AppError } from "../middleware/error.middleware";
import prisma from "../lib/prisma";
import cloudinary from "../lib/cloudinary";

async function cleanProfileFields(data: Record<string, any>) {
  return Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined),
  );
}

async function ensureProfileExists(userId: string) {
  const profile = await prisma.profile.findUnique({
    where: { userId },
    include: { links: { orderBy: { order: "asc" } } },
  });

  if (profile) return profile;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, email: true },
  });

  if (!user) {
    throw new AppError(404, "User not found");
  }

  return prisma.profile.create({
    data: {
      userId,
      fullName: user.name || "User",
      email: user.email,
      links: { create: [] },
    },
    include: { links: { orderBy: { order: "asc" } } },
  });
}

export const ProfileService = {
  /**
   * Upload a profile photo to Cloudinary and save the returned URL.
   * Uses a stream upload so the buffer never touches disk.
   * Old photo is replaced — Cloudinary public_id is keyed by userId
   * so re-uploading automatically overwrites the previous image.
   */
  async uploadPhoto(
    userId: string,
    buffer: Buffer,
    mimetype: string,
  ): Promise<string> {
    await ensureProfileExists(userId);

    const imageUrl = await new Promise<string>((resolve, reject) => {
      // Use upload_stream to pipe the memory buffer directly to Cloudinary
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: "nfc-cards/profiles",
          public_id: `user_${userId}`, // Keyed by userId so re-upload overwrites old photo
          overwrite: true,
          resource_type: "image",
          format: mimetype.split("/")[1], // Preserve original format (jpeg/png/webp)
        },
        (error, result) => {
          if (error || !result)
            return reject(new AppError(500, "Photo upload failed"));
          resolve(result.secure_url);
        },
      );
      stream.end(buffer);
    });

    // Save the Cloudinary URL back to the profile
    await prisma.profile.update({
      where: { userId },
      data: { imageUrl },
    });

    return imageUrl;
  },

  /**
   * Get a user's full profile (for editing in dashboard)
   */
  async getProfile(userId: string) {
    return ensureProfileExists(userId);
  },

  /**
   * Update profile data and replace all links.
   * Uses a transaction so links and profile are always in sync.
   *
   * FLOW:
   *   1. Verify profile exists for this user
   *   2. Update profile fields in transaction
   *   3. Replace all links in transaction
   *   4. Fetch and return updated profile with new links
   *
   * TIMEOUT: 60 seconds to handle high-concurrency scenarios
   * ERRORS: Clear, user-centric error messages
   * SUCCESS: Returns updated profile data
   */
  async updateProfile(userId: string, body: UpdateProfileBody) {
    const { links, ...profileData } = body;

    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, email: true },
      });

      if (!user) {
        throw new AppError(404, "User not found");
      }

      const existingProfile = await prisma.profile.findUnique({
        where: { userId },
        select: { id: true },
      });

      if (!existingProfile) {
        const createData: any = {
          userId,
          fullName: profileData.fullName ?? user.name,
          email: profileData.email ?? user.email,
          ...(await cleanProfileFields(profileData)),
        };

        if (links !== undefined && Array.isArray(links)) {
          createData.links = {
            create: links.map((link, index) => ({
              type: link.type,
              label: link.label,
              url: link.url,
              order: link.order ?? index,
            })),
          };
        }

        return prisma.profile.create({
          data: createData,
          include: { links: { orderBy: { order: "asc" } } },
        });
      }

      // Step 2-4: Update profile + links in atomic transaction
      const updatedProfile = await prisma.$transaction(
        async (tx) => {
          // Update scalar profile fields
          const updated = await tx.profile.update({
            where: { id: existingProfile.id },
            data: profileData,
            select: { id: true }, // Just get ID to confirm success
          });

          // If links provided, replace them entirely
          if (links !== undefined && Array.isArray(links)) {
            // Delete all existing links for this profile
            await tx.link.deleteMany({
              where: { profileId: updated.id },
            });

            // Insert new links
            if (links.length > 0) {
              await tx.link.createMany({
                data: links.map((link, index) => ({
                  profileId: updated.id,
                  type: link.type,
                  label: link.label,
                  url: link.url,
                  order: link.order ?? index,
                })),
              });
            }
          }

          // Fetch complete updated profile with all links
          const finalProfile = await tx.profile.findUnique({
            where: { id: updated.id },
            include: { links: { orderBy: { order: "asc" } } },
          });

          if (!finalProfile) {
            throw new Error("Profile read-back failed after update");
          }

          return finalProfile;
        },
        { timeout: 60000 }, // 60 second timeout
      );

      return updatedProfile;
    } catch (error: any) {
      // Transaction timeout
      if (
        error.code === "P1008" ||
        error.message?.includes("Transaction API error")
      ) {
        throw new AppError(
          503,
          "Database is currently busy. Please try again in a few moments. " +
            "If this persists, contact support. (Error: DB_TIMEOUT)",
        );
      }

      // Unique constraint violation (email already exists, etc)
      if (error.code === "P2002") {
        const field = error.meta?.target?.[0] || "field";
        throw new AppError(
          409,
          `This ${field} is already in use. Please use a different value.`,
        );
      }

      // Serialization error (concurrent modifications)
      if (error.code === "P2034") {
        throw new AppError(
          409,
          "Your profile was modified by another session. Please refresh and try again.",
        );
      }

      // Generic Prisma errors
      if (error.code?.startsWith("P")) {
        throw new AppError(
          500,
          "Failed to save profile changes due to a database issue. Please try again.",
        );
      }

      // Re-throw AppErrors as-is (includes our manual profile check error above)
      if (error instanceof AppError) {
        throw error;
      }

      // Unexpected errors
      console.error("[ProfileService.updateProfile] Unexpected error:", error);
      throw new AppError(
        500,
        "An unexpected error occurred while saving your profile. Please try again.",
      );
    }
  },

  /**
   * Get a public-facing profile view (no sensitive fields).
   * This is what gets shown when someone scans a card.
   */
  async getPublicProfile(userId: string): Promise<PublicProfile> {
    const profile = await prisma.profile.findUnique({
      where: { userId },
      include: { links: { orderBy: { order: "asc" } } },
    });

    if (!profile) throw new AppError(404, "Profile not found");

    // Return only fields safe to expose publicly
    return {
      fullName: profile.fullName,
      jobTitle: profile.jobTitle,
      company: profile.company,
      phone: profile.phone,
      email: profile.email,
      website: profile.website,
      bio: profile.bio,
      imageUrl: profile.imageUrl,
      whatsapp: profile.whatsapp,
      links: profile.links.map((l) => ({
        type: l.type,
        label: l.label,
        url: l.url,
        order: l.order,
      })),
    };
  },
};
