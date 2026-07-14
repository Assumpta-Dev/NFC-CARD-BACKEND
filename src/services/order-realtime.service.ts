import { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { JwtPayload } from "../types";
import prisma from "../lib/prisma";
import logger from "../utils/logger";

let io: Server | null = null;

function businessRoom(businessId: string) {
  return `business:${businessId}`;
}

function orderRoom(orderId: string) {
  return `order:${orderId}`;
}

async function resolveBusinessIdsForUser(userId: string, role: string): Promise<string[]> {
  const ids = new Set<string>();

  if (role === "BUSINESS" || role === "ADMIN") {
    const owned = await prisma.businessProfile.findMany({
      where: role === "ADMIN" ? undefined : { userId },
      select: { id: true },
    });
    for (const b of owned) ids.add(b.id);
  }

  const staff = await prisma.businessStaff.findMany({
    where: { userId, isActive: true },
    select: { businessId: true },
  });
  for (const s of staff) ids.add(s.businessId);

  return [...ids];
}

async function joinBusinessRooms(socket: Socket): Promise<string[]> {
  const user = socket.data.user as JwtPayload | undefined;
  if (!user?.userId) return [];
  const businessIds = await resolveBusinessIdsForUser(user.userId, String(user.role));
  for (const id of businessIds) {
    await socket.join(businessRoom(id));
  }
  socket.data.businessIds = businessIds;
  return businessIds;
}

export function initOrderRealtime(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: {
      origin: true,
      credentials: true,
      methods: ["GET", "POST"],
    },
    path: "/socket.io",
    transports: ["websocket", "polling"],
    allowEIO3: true,
  });

  // Optional JWT — guests may connect and subscribe to a single order room
  io.use(async (socket, next) => {
    try {
      const token =
        (socket.handshake.auth?.token as string | undefined) ||
        (typeof socket.handshake.query?.token === "string"
          ? socket.handshake.query.token
          : undefined);

      if (!token) {
        socket.data.guest = true;
        return next();
      }

      const secret = process.env.JWT_SECRET;
      if (!secret) return next(new Error("Server configuration error"));

      const decoded = jwt.verify(token, secret) as JwtPayload;
      if (!decoded?.userId) {
        return next(new Error("Invalid token payload"));
      }
      socket.data.user = decoded;
      socket.data.guest = false;
      next();
    } catch (err) {
      logger.warn("WS auth failed", {
        error: err instanceof Error ? err.message : String(err),
      });
      next(new Error("Invalid or expired token"));
    }
  });

  io.on("connection", async (socket: Socket) => {
    const user = socket.data.user as JwtPayload | undefined;

    if (user?.userId) {
      try {
        const businessIds = await joinBusinessRooms(socket);
        logger.info(
          `WS connected user=${user.userId} role=${user.role} rooms=${businessIds.join(",") || "(none)"}`,
        );
        socket.emit("orders:joined", { businessIds });
      } catch (err) {
        logger.warn("WS room join failed", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    } else {
      logger.info("WS guest connected (tracking mode)");
    }

    socket.on("orders:join", async () => {
      if (!socket.data.user) return;
      try {
        const businessIds = await joinBusinessRooms(socket);
        socket.emit("orders:joined", { businessIds });
      } catch (err) {
        logger.warn("WS rejoin failed", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    });

    socket.on("order:subscribe", async (orderId: string) => {
      if (typeof orderId !== "string" || !orderId.trim()) return;
      const id = orderId.trim();
      const exists = await prisma.order.findUnique({
        where: { id },
        select: { id: true },
      });
      if (!exists) {
        socket.emit("order:subscribe_error", { message: "Order not found" });
        return;
      }
      await socket.join(orderRoom(id));
      socket.emit("order:subscribed", { orderId: id });
    });

    socket.on("disconnect", (reason) => {
      logger.info(`WS disconnect user=${user?.userId ?? "guest"} reason=${reason}`);
    });
  });

  logger.info("Order WebSocket server ready");
  return io;
}

export function emitBusinessOrderEvent(
  businessId: string,
  event: "order:created" | "order:updated",
  order: unknown,
) {
  if (!io) {
    logger.warn(`WS emit skipped (io not ready): ${event} business=${businessId}`);
    return;
  }

  const room = businessRoom(businessId);
  const listeners = io.sockets.adapter.rooms.get(room)?.size ?? 0;
  logger.info(`WS emit ${event} → ${room} listeners=${listeners}`);

  io.to(room).emit(event, order);

  const orderId = (order as { id?: string } | null)?.id;
  if (orderId) {
    io.to(orderRoom(orderId)).emit(event, order);
  }
}

export function getOrderIO(): Server | null {
  return io;
}
