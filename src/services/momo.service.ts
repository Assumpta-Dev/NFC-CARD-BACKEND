// ===========================================================
// MTN MOMO SERVICE
// ===========================================================
// Handles all communication with the MTN MoMo Collection API.
// Flow:
//   1. getAccessToken()  — exchanges User ID + API Key for a Bearer token
//   2. requestToPay()    — sends a payment prompt to the customer's phone
//   3. getPaymentStatus() — polls MTN to check if customer approved/rejected
//
// All credentials are read from environment variables — never hardcoded.
// Rwanda sandbox base URL: https://sandbox.momodeveloper.mtn.co.rw
// ===========================================================

import https from "https";
import http from "http";
import { randomUUID } from "crypto";

// Read all MoMo config from environment — set in .env
const MOMO_BASE_URL = process.env.MOMO_BASE_URL!;
const MOMO_COLLECTION_PRIMARY_KEY = process.env.MOMO_COLLECTION_PRIMARY_KEY!;
const MOMO_COLLECTION_USER_ID = process.env.MOMO_COLLECTION_USER_ID!;
const MOMO_COLLECTION_API_KEY = process.env.MOMO_COLLECTION_API_KEY!;
const MOMO_ENVIRONMENT = process.env.MOMO_ENVIRONMENT!; // "sandbox" or "production"
const MOMO_CURRENCY = process.env.MOMO_CURRENCY!; // RWF for Rwanda

async function fetchJson<T>(
  url: string,
  options: { method: string; headers: Record<string, string>; body?: string },
): Promise<{ status: number; data: T }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === "https:" ? https : http;

    const req = lib.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method: options.method,
        headers: options.headers,
      },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => (raw += chunk));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode ?? 0, data: raw ? JSON.parse(raw) : ({} as T) });
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

async function getAccessToken(): Promise<string> {
  const credentials = Buffer.from(
    `${MOMO_COLLECTION_USER_ID}:${MOMO_COLLECTION_API_KEY}`,
  ).toString("base64");

  const { status, data } = await fetchJson<{ access_token: string }>(
    `${MOMO_BASE_URL}/collection/token/`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Ocp-Apim-Subscription-Key": MOMO_COLLECTION_PRIMARY_KEY,
      },
    },
  );

  if (status !== 200 || !(data as any).access_token) {
    throw new Error(`MoMo token error: ${JSON.stringify(data)}`);
  }

  return (data as any).access_token;
}

export async function requestToPay(
  phone: string,
  amount: number,
  paymentId: string,
): Promise<string> {
  const token = await getAccessToken();
  const referenceId = randomUUID();

  // Normalize phone: strip leading 0 and add 250 country code
  const normalizedPhone = phone.replace(/^0/, "250").replace(/\D/g, "");

  const { status, data } = await fetchJson<unknown>(
    `${MOMO_BASE_URL}/collection/v1_0/requesttopay`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Reference-Id": referenceId,
        "X-Target-Environment": MOMO_ENVIRONMENT,
        "Ocp-Apim-Subscription-Key": MOMO_COLLECTION_PRIMARY_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: String(amount),
        currency: MOMO_CURRENCY,
        externalId: paymentId,
        payer: { partyIdType: "MSISDN", partyId: normalizedPhone },
        payerMessage: "NFC Card Subscription",
        payeeNote: "NFC Card Payment",
      }),
    },
  );

  // 202 Accepted = request sent to phone successfully
  if (status !== 202) {
    throw new Error(`MoMo requestToPay failed (${status}): ${JSON.stringify(data)}`);
  }

  return referenceId;
}

export async function getPaymentStatus(
  referenceId: string,
): Promise<"SUCCESSFUL" | "FAILED" | "PENDING"> {
  const token = await getAccessToken();

  const { status, data } = await fetchJson<{ status: string }>(
    `${MOMO_BASE_URL}/collection/v1_0/requesttopay/${referenceId}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Target-Environment": MOMO_ENVIRONMENT,
        "Ocp-Apim-Subscription-Key": MOMO_COLLECTION_PRIMARY_KEY,
      },
    },
  );

  if (status !== 200) {
    throw new Error(`MoMo status check failed (${status}): ${JSON.stringify(data)}`);
  }

  return (data as any).status as "SUCCESSFUL" | "FAILED" | "PENDING";
}
