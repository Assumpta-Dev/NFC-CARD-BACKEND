// ===========================================================
// CLOUDINARY CONFIG
// ===========================================================
// Cloudinary is used for profile photo storage because:
//   - Images are served via CDN (fast globally)
//   - Automatic image optimization and resizing
//   - No need to manage disk storage on the server
//
// CLOUDINARY_URL in .env is auto-parsed by the SDK —
// no need to manually extract cloud_name, api_key, api_secret.
// ===========================================================
import { v2 as cloudinary } from "cloudinary";
import "dotenv/config";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export default cloudinary;
