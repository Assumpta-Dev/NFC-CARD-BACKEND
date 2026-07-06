
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

  const userRows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT name, email FROM users WHERE id = $1 LIMIT 1`, userId
  );
  const user = userRows[0] ?? null;

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

function buildBusinessProfileSyncData(data: Partial<UpdateProfileBody>) {
  const businessData: Record<string, any> = {};
  if (data.fullName !== undefined) businessData.name = data.fullName;
  if (data.jobTitle !== undefined && data.jobTitle !== null) {
    businessData.category = data.jobTitle;
  }
  if (data.company !== undefined) businessData.location = data.company;
  if (data.phone !== undefined) businessData.phone = data.phone;
  if (data.email !== undefined) businessData.email = data.email;
  if (data.website !== undefined) businessData.website = data.website;
  if (data.bio !== undefined) businessData.description = data.bio;
  if (data.imageUrl !== undefined && data.imageUrl !== null) {
    businessData.imageUrl = data.imageUrl;
  }

  return businessData;
}

export const ProfileService = {
  async uploadPhoto(
    userId: string,
    buffer: Buffer,
    mimetype: string,
  ): Promise<string> {
    await ensureProfileExists(userId);

    const imageUrl = await new Promise<string>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: "nfc-cards/profiles",
          public_id: `user_${userId}`,
          overwrite: true,
          resource_type: "image",
          format: mimetype.split("/")[1],
        },
        (error, result) => {
          if (error || !result)
            return reject(new AppError(500, "Photo upload failed"));
          resolve(result.secure_url);
        },
      );
      stream.end(buffer);
    });

    await prisma.profile.update({
      where: { userId },
      data: { imageUrl },
    });

    await prisma.businessProfile.updateMany({
      where: { userId },
      data: { imageUrl },
    });

    return imageUrl;
  },

  async uploadCoverPhoto(
    userId: string,
    buffer: Buffer,
    mimetype: string,
  ): Promise<string> {
    await ensureProfileExists(userId);

    const coverImageUrl = await new Promise<string>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: "nfc-cards/covers",
          public_id: `cover_${userId}`,
          overwrite: true,
          resource_type: "image",
          format: mimetype.split("/")[1],
        },
        (error, result) => {
          if (error || !result)
            return reject(new AppError(500, "Cover photo upload failed"));
          resolve(result.secure_url);
        },
      );
      stream.end(buffer);
    });

    await prisma.profile.update({
      where: { userId },
      data: { coverImageUrl },
    });

    return coverImageUrl;
  },

  async getProfile(userId: string) {
    return ensureProfileExists(userId);
  },

  async getBusinessProfile(userId: string) {
    return prisma.businessProfile.findUnique({
      where: { userId },

      include: {
        menus: {
          include: {
            items: true,
          },
        },
      },
    });
  },

  async updateProfile(userId: string, body: UpdateProfileBody) {
    const { links, ...profileData } = body;

    try {
      const userRows = await prisma.$queryRawUnsafe<any[]>(
        `SELECT name, email FROM users WHERE id = $1 LIMIT 1`, userId
      );
      const user = userRows[0] ?? null;

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

        const createdProfile = await prisma.profile.create({
          data: createData,
          include: { links: { orderBy: { order: "asc" } } },
        });

        const businessSyncData = buildBusinessProfileSyncData({
          fullName: createData.fullName,
          jobTitle: createData.jobTitle,
          company: createData.company,
          phone: createData.phone,
          email: createData.email,
          website: createData.website,
          bio: createData.bio,
          imageUrl: createData.imageUrl,
        });

        if (Object.keys(businessSyncData).length > 0) {
          await prisma.businessProfile.updateMany({
            where: { userId },
            data: businessSyncData,
          });
        }

        return createdProfile;
      }

      const updatedProfile = await prisma.$transaction(
        async (tx) => {
          const updateData: Record<string, any> = Object.fromEntries(
            Object.entries(profileData).filter(([key, value]) => {
              if (value === undefined) return false;
              if (key === "imageUrl" && value === null) return false;
              return true;
            })
          );

          const updated = await tx.profile.update({
            where: { id: existingProfile.id },
            data: updateData,
            select: { id: true },
          });

          const businessSyncData = buildBusinessProfileSyncData(profileData);

          if (Object.keys(businessSyncData).length > 0) {
            await tx.businessProfile.updateMany({
              where: { userId },
              data: businessSyncData,
            });
          }

          if (links !== undefined && Array.isArray(links)) {
            await tx.link.deleteMany({
              where: { profileId: updated.id },
            });

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

          const finalProfile = await tx.profile.findUnique({
            where: { id: updated.id },
            include: { links: { orderBy: { order: "asc" } } },
          });

          if (!finalProfile) {
            throw new Error("Profile read-back failed after update");
          }

          return finalProfile;
        },
        { timeout: 60000 },
      );

      return updatedProfile;
    } catch (error: any) {
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

      if (error.code === "P2002") {
        const field = error.meta?.target?.[0] || "field";
        throw new AppError(
          409,
          `This ${field} is already in use. Please use a different value.`,
        );
      }

      if (error.code === "P2034") {
        throw new AppError(
          409,
          "Your profile was modified by another session. Please refresh and try again.",
        );
      }

      if (error.code?.startsWith("P")) {
        throw new AppError(
          500,
          "Failed to save profile changes due to a database issue. Please try again.",
        );
      }

      if (error instanceof AppError) {
        throw error;
      }

      console.error("[ProfileService.updateProfile] Unexpected error:", error);
      throw new AppError(
        500,
        "An unexpected error occurred while saving your profile. Please try again.",
      );
    }
  },

  async getPublicProfile(userId: string): Promise<PublicProfile> {
    const profile = await prisma.profile.findUnique({
      where: { userId },
      include: { links: { orderBy: { order: "asc" } } },
    });

    if (!profile) throw new AppError(404, "Profile not found");

    return {
      fullName: profile.fullName,
      jobTitle: profile.jobTitle,
      company: profile.company,
      phone: profile.phone,
      email: profile.email,
      website: profile.website,
      bio: profile.bio,
      imageUrl: profile.imageUrl,
      coverImageUrl: profile.coverImageUrl,
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
