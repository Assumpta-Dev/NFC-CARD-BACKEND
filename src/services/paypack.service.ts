// ===========================================================
// PAYPACK SERVICE
// ===========================================================
// Handles all communication with the Paypack API (paypack.rw).
// Paypack is a Rwanda payment gateway that supports MTN MoMo
// and Airtel Money — users get a push prompt on their phone.
//
// Flow:
//   1. getAccessToken() — exchanges APP_ID + APP_SECRET for a token
//   2. cashin()         — sends payment request to customer's phone
//   3. getTransaction() — checks if customer approved or rejected
//
// Webhook (passive):
//   Paypack calls POST /api/payments/webhook automatically
//   when a transaction status changes — no polling needed.
//
// Docs: https://paypack.rw/docs
// ===========================================================

import https from "https";
import { randomUUID } from "crypto";

const PAYPACK_BASE_URL = "https://payments.paypack.rw/api";
const APP_ID = process.env.PAYPACK_APP_ID!;
const APP_SECRET = process.env.PAYPACK_APP_SECRET!;

// Token cache — reuse token until it expires (avoid re-authenticating every request)
let cachedToken: string | null = null;
let tokenExpiresAt = 0;

// ===========================================================
// HTTP HELPER
// ===========================================================
async function fetchJson<T>(
  url: string,
  options: { method: string; headers: Record<string, string>; body?: string },
): Promise<{ status: number; data: T }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);

    const req = https.request(
      {
        hostname: parsed.hostname,
        port: 443,
        path: parsed.pathname + parsed.search,
        method: options.method,
        headers: options.headers,
      },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => (raw += chunk));
        res.on("end", () => {
          try {
            resolve({
              status: res.statusCode ?? 0,
              data: raw ? JSON.parse(raw) : ({} as T),
            });
          } catch {
            resolve({ status: res.statusCode ?? 0, data: raw as unknown as T });
          }
        });
      },
    );

    req.on("error", reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

// ===========================================================
// AUTHENTICATION
// ===========================================================
// Paypack tokens are valid for 24 hours — we cache and reuse them.
async function getAccessToken(): Promise<string> {
  const now = Date.now();

  // Return cached token if still valid (with 60s buffer)
  if (cachedToken && now < tokenExpiresAt - 60_000) {
    return cachedToken;
  }

  const { status, data } = await fetchJson<{ access: string; refresh: string }>(
    `${PAYPACK_BASE_URL}/auth/agents/authorize`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: APP_ID, client_secret: APP_SECRET }),
    },
  );

  if (status !== 200 || !(data as any).access) {
    throw new Error(`Paypack auth failed (${status}): ${JSON.stringify(data)}`);
  }

  cachedToken = (data as any).access;
  tokenExpiresAt = now + 24 * 60 * 60 * 1000; // 24 hours

  return cachedToken!;
}

// ===========================================================
// CASHIN — Request payment from customer's phone
// ===========================================================
// Sends a USSD push to the customer's MTN/Airtel number.
// They see a prompt on their phone and enter their PIN to pay.
// Returns the Paypack transaction reference (used for status checks).
export async function cashin(
  phone: string,
  amount: number,
): Promise<string> {
  const token = await getAccessToken();

  // Normalize phone: strip leading 0, add Rwanda country code 250
  const normalizedPhone = phone.replace(/^0/, "250").replace(/\D/g, "");

  const ref = randomUUID(); // unique reference for this transaction

  const { status, data } = await fetchJson<{ ref: string }>(
    `${PAYPACK_BASE_URL}/transactions/cashin`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": ref, // prevents duplicate charges on retry
      },
      body: JSON.stringify({
        amount,
        number: normalizedPhone,
      }),
    },
  );

  // 200 or 201 = request accepted and sent to phone
  if (status !== 200 && status !== 201) {
    throw new Error(`Paypack cashin failed (${status}): ${JSON.stringify(data)}`);
  }

  return (data as any).ref ?? ref;
}

// ===========================================================
// GET TRANSACTION STATUS
// ===========================================================
// Used for manual polling if webhook hasn't fired yet.
// Returns: "pending" | "successful" | "failed"
export async function getTransaction(
  ref: string,
): Promise<{ status: string; amount: number; number: string }> {
  const token = await getAccessToken();

  const { status, data } = await fetchJson<{ status: string; amount: number; number: string }>(
    `${PAYPACK_BASE_URL}/transactions/find/${ref}`,
    {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    },
  );

  if (status !== 200) {
    throw new Error(`Paypack status check failed (${status}): ${JSON.stringify(data)}`);
  }

  return data as any;
}
