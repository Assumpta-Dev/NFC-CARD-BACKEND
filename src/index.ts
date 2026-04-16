// ===========================================================
// SERVER ENTRY POINT
// ===========================================================
// This file bootstraps the Express server:
//   1. Loads environment variables
//   2. Creates and configures the Express app
//   3. Registers middleware (in the correct order — order matters!)
//   4. Mounts route modules
//   5. Registers error handlers (must be last)
//   6. Starts listening
//
// Keeping bootstrap logic in index.ts and app config in app.ts
// (if you split them) makes integration testing easier.
// ===========================================================

import "dotenv/config"; // Load .env variables before anything else
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import morgan from "morgan";
import swaggerUi from "swagger-ui-express";
import { swaggerSpec } from "./swagger";

import {
  authRouter,
  cardRouter,
  profileRouter,
  adminRouter,
  userRouter,
  publicCardRouter,
} from "./routes";
import { errorHandler } from "./middleware/error.middleware";
import { notFoundHandler } from "./middleware/error.middleware";
import logger from "./utils/logger";

const app = express();
const PORT = process.env.PORT || 5000;

// ===========================================================
// SECURITY MIDDLEWARE
// Helmet sets secure HTTP response headers (CSP, HSTS, etc.)
// These protect against common web vulnerabilities automatically
// Applied first so headers are set on all responses including errors
// ===========================================================
app.use(
  helmet({
    // Allow inline styles/scripts needed for any server-rendered content
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"], // Tailwind inline styles need this
        imgSrc: ["'self'", "data:", "https:"], // Allow HTTPS images (profile photos)
      },
    },
  }),
);

// ===========================================================
// CORS CONFIGURATION
// Restricts which origins can call the API.
// In development, allow localhost frontend.
// In production, set FRONTEND_URL env var to your actual domain.
// ===========================================================

app.use(
  cors({
    origin: true, // ✅ allow all origins dynamically
    credentials: true,
  }),
);

// ===========================================================
// RATE LIMITING
// Protects against brute-force and DDoS attacks.
// More restrictive limits on auth endpoints (see auth routes).
// ===========================================================
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15-minute window
  max: 200, // Max 200 requests per window per IP
  message: {
    success: false,
    error: "Too many requests, please try again later",
  },
  standardHeaders: true, // Return rate limit info in headers
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20, // Much stricter for auth — prevents password brute-force
  message: {
    success: false,
    error: "Too many login attempts, please try again later",
  },
});

app.use(globalLimiter);

// ===========================================================
// BODY PARSING
// Limit body size to prevent memory exhaustion attacks
// JSON and URL-encoded bodies are the most common for REST APIs
// ===========================================================
app.use(express.json({ limit: "10mb" })); // 10mb allows base64 image uploads
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// ===========================================================
// REQUEST LOGGING
// Morgan logs every HTTP request to the console/log system
// 'combined' format includes IP, method, URL, status, response time
// In production, pipe logs to Winston or a centralized service
// ===========================================================
app.use(
  morgan("combined", {
    stream: { write: (message) => logger.http(message.trim()) },
    // Skip logging health checks to reduce noise
    skip: (req) => req.path === "/health",
  }),
);

// ===========================================================
// API DOCS
// Swagger UI served at /api-docs — only in non-production
// to avoid exposing internal API structure publicly
// ===========================================================
if (process.env.NODE_ENV !== "production") {
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
}

// ===========================================================
// HEALTH CHECK ENDPOINT
// Used by load balancers and container orchestration (K8s) to
// verify the app is running and ready to receive traffic
// ===========================================================
app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// ===========================================================
// ROUTE MOUNTING
// Prefix all API routes with /api for clear separation.
// Apply auth rate limiter only to auth routes.
// ===========================================================
app.use("/api/auth", authLimiter, authRouter);
app.use("/api/cards", cardRouter);
app.use("/api/profile", profileRouter);
app.use("/api/user", userRouter);
app.use("/api/admin", adminRouter);
app.use("/api/c", publicCardRouter); // Short URL for NFC/QR codes

// ===========================================================
// ERROR HANDLERS (must be registered AFTER routes)
// Express identifies error handlers by their 4-argument signature
// notFoundHandler must come before errorHandler
// ===========================================================
app.use(notFoundHandler);
app.use(errorHandler);

// ===========================================================
// START SERVER
// ===========================================================
app.listen(PORT, () => {
  logger.info(`🚀 NFC Card API running on http://localhost:${PORT}`);
  logger.info(`📊 Environment: ${process.env.NODE_ENV || "development"}`);
});

// Handle uncaught errors gracefully — log before crash
process.on("uncaughtException", (err) => {
  logger.error("Uncaught Exception:", err);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled Promise Rejection:", reason);
  process.exit(1);
});

export default app;
