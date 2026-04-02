import "dotenv/config";
import cors from "cors";
import express from "express";
import { buildTelnyxVisibility } from "./lib/telnyx.js";
import { buildTwilioVisibility } from "./lib/twilio.js";

/** Shared Express app: API routes only (used by Vercel serverless + local server). */
export function createApp(): express.Express {
  const app = express();

  app.use(cors());
  app.use(express.json());

  type CacheEntry = { at: number; body: unknown };
  const cacheTtlMs = Number(process.env.VISIBILITY_CACHE_TTL_MS ?? 180_000);
  const cache = new Map<string, CacheEntry>();

  function getCached(key: string): unknown | undefined {
    if (cacheTtlMs <= 0) return undefined;
    const e = cache.get(key);
    if (!e) return undefined;
    if (Date.now() - e.at > cacheTtlMs) {
      cache.delete(key);
      return undefined;
    }
    return e.body;
  }

  function setCached(key: string, body: unknown) {
    if (cacheTtlMs <= 0) return;
    cache.set(key, { at: Date.now(), body });
  }

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.get("/api/visibility", async (req, res) => {
    const provider = (req.query.provider as string)?.toLowerCase();
    if (provider !== "twilio" && provider !== "telnyx") {
      res.status(400).json({
        error: "Query provider must be twilio or telnyx",
      });
      return;
    }

    const cacheKey = `visibility:${provider}`;
    const hit = getCached(cacheKey);
    if (hit !== undefined) {
      res.json(hit);
      return;
    }

    try {
      if (provider === "twilio") {
        const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
        const token = process.env.TWILIO_AUTH_TOKEN?.trim();
        if (!sid || !token) {
          res.status(503).json({
            provider: "twilio",
            error: "Missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN",
            data: { subaccounts: [] },
          });
          return;
        }
        const data = await buildTwilioVisibility(sid, token);
        const body = {
          provider: "twilio" as const,
          fetchedAt: new Date().toISOString(),
          data,
        };
        setCached(cacheKey, body);
        res.json(body);
        return;
      }

      const data = await buildTelnyxVisibility();
      const body = {
        provider: "telnyx" as const,
        fetchedAt: new Date().toISOString(),
        data,
      };
      setCached(cacheKey, body);
      res.json(body);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      res.status(500).json({ error: message });
    }
  });

  return app;
}
