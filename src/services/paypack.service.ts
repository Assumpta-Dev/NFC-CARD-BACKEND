

import https from "https";
import { randomUUID } from "crypto";

const PAYPACK_BASE_URL = "https://payments.paypack.rw/api";
const APP_ID = process.env.PAYPACK_APP_ID!;
const APP_SECRET = process.env.PAYPACK_APP_SECRET!;

let cachedToken: string | null = null;
let tokenExpiresAt = 0;

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

async function getAccessToken(): Promise<string> {
  const now = Date.now();

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
  tokenExpiresAt = now + 24 * 60 * 60 * 1000;

  return cachedToken!;
}

export async function cashin(
  phone: string,
  amount: number,
): Promise<string> {
  const token = await getAccessToken();

  const normalizedPhone = phone.replace(/^0/, "250").replace(/\D/g, "");

  const ref = randomUUID();

  const { status, data } = await fetchJson<{ ref: string }>(
    `${PAYPACK_BASE_URL}/transactions/cashin`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": ref,
      },
      body: JSON.stringify({
        amount,
        number: normalizedPhone,
      }),
    },
  );

  if (status !== 200 && status !== 201) {
    throw new Error(`Paypack cashin failed (${status}): ${JSON.stringify(data)}`);
  }

  return (data as any).ref ?? ref;
}

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
