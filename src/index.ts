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

import "dotenv/config";
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
import { paymentRouter, menuRouter, businessRouter } from "./routes";


const app = express();
const PORT = process.env.PORT || 5000;

// ===========================================================
// SECURITY MIDDLEWARE
// ===========================================================
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
  }),
);

// ===========================================================
// CORS CONFIGURATION
// ===========================================================
app.use(
  cors({
    origin: true,
    credentials: true,
  }),
);

// ===========================================================
// RATE LIMITING
// ===========================================================
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: {
    success: false,
    error: "Too many requests, please try again later",
  },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: {
    success: false,
    error: "Too many login attempts, please try again later",
  },
});

app.use(globalLimiter);

// ===========================================================
// BODY PARSING
// ===========================================================
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// ===========================================================
// REQUEST LOGGING
// ===========================================================
app.use(
  morgan("combined", {
    stream: { write: (message) => logger.http(message.trim()) },
    skip: (req) => req.path === "/health",
  }),
);

// ===========================================================
// API DOCS
// ===========================================================
// enableSwagger: Allows local testing without affecting production deployment.
// In production, set NODE_ENV=production or ENABLE_SWAGGER=false to disable.
const enableSwagger =
  process.env.NODE_ENV !== "production" ||
  process.env.ENABLE_SWAGGER === "true";

if (enableSwagger) {
  // serve: middleware to serve swagger-ui static files (CSS, JS)
  // setup: handler that returns the Swagger UI HTML page
  // Using both together ensures static files are properly served
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customCss: '.swagger-ui .topbar { display: none }', // hides top bar for cleaner look
    customSiteTitle: "NFC Card API Documentation",
  }));
}

// ===========================================================
// HEALTH CHECK ENDPOINT
// ===========================================================
app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// ===========================================================
// ROOT ROUTE (SAFE ADDITION — FIXES YOUR ERROR)
// ===========================================================
app.get("/", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "NFC Card API is running",
    docs: enableSwagger ? "/api-docs" : "disabled",
  });
});

// ===========================================================
// ROUTE MOUNTING
// ===========================================================
app.use("/api/auth", authLimiter, authRouter);
app.use("/api/cards", cardRouter);
app.use("/api/profile", profileRouter);
app.use("/api/user", userRouter);
app.use("/api/admin", adminRouter);
app.use("/api/c", publicCardRouter);

// ✔ FIXED ORDER (IMPORTANT)
app.use("/api/business", businessRouter);
app.use("/api/menu", menuRouter);
app.use("/api/payments", paymentRouter);

// ===========================================================
// ERROR HANDLERS
// ===========================================================
app.use(notFoundHandler);
app.use(errorHandler);

// ===========================================================
// START SERVER
// ===========================================================
app.listen(PORT, () => {
  logger.info(`🚀 NFC Card API running on http://localhost:${PORT}`);
  logger.info(`📊 Environment: ${process.env.NODE_ENV || "development"}`);
  logger.info(`🔗 Allowing CORS from: ${process.env.FRONTEND_URL}`);
});

// Handle uncaught errors
process.on("uncaughtException", (err) => {
  logger.error("Uncaught Exception:", err);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled Promise Rejection:", reason);
  process.exit(1);
});

export default app;
