import { Router } from "express";
import { GetProductionsTodayResponse } from "@workspace/api-zod";
import { requireOperator } from "../lib/auth";

const router = Router();

const DEFAULT_BOOKINGS_API_URL = "https://plex.bookstud.io/api/public/bookings";

function todayRange(): { start: string; end: string } {
  // "Today" in the server's local timezone (set TZ on the api container;
  // defaults to UTC when unset).
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  return { start: start.toISOString(), end: end.toISOString() };
}

router.get("/productions/today", requireOperator, async (req, res): Promise<void> => {
  const baseUrl = process.env.BOOKINGS_API_URL ?? DEFAULT_BOOKINGS_API_URL;
  const { start, end } = todayRange();

  let upstream: URL;
  try {
    upstream = new URL(baseUrl);
  } catch {
    req.log.error({ baseUrl }, "Invalid BOOKINGS_API_URL");
    res.status(502).json({ error: "Bookings API is misconfigured" });
    return;
  }
  upstream.searchParams.set("start", start);
  upstream.searchParams.set("end", end);

  let raw: unknown;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const response = await fetch(upstream, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!response.ok) {
      req.log.error({ status: response.status }, "Bookings API returned non-OK status");
      res.status(502).json({ error: "Bookings API is unavailable" });
      return;
    }
    raw = await response.json();
  } catch (err) {
    req.log.error({ err }, "Failed to fetch from bookings API");
    res.status(502).json({ error: "Bookings API is unavailable" });
    return;
  }

  if (!Array.isArray(raw)) {
    req.log.error("Bookings API did not return an array");
    res.status(502).json({ error: "Bookings API returned an unexpected response" });
    return;
  }

  const rangeStart = new Date(start).getTime();
  const rangeEnd = new Date(end).getTime();

  const productions = raw
    .map((b) => {
      const item = b as Record<string, unknown>;
      return {
        id: item.id,
        title: item.title,
        description: item.description ?? null,
        start: item.start,
        end: item.end,
        studioId: item.studioId ?? null,
        type: item.type,
        status: item.status,
        color: item.color ?? null,
      };
    })
    .filter(
      (b) =>
        typeof b.id === "number" &&
        typeof b.title === "string" &&
        typeof b.start === "string" &&
        typeof b.end === "string" &&
        typeof b.type === "string" &&
        typeof b.status === "string",
    )
    .filter((b) => {
      // Keep only bookings that actually overlap today (server-local TZ) window
      // (the upstream API returns some out-of-range items).
      const bStart = new Date(b.start as string).getTime();
      const bEnd = new Date(b.end as string).getTime();
      if (Number.isNaN(bStart) || Number.isNaN(bEnd)) return false;
      return bStart <= rangeEnd && bEnd >= rangeStart;
    })
    .sort((a, b) => new Date(a.start as string).getTime() - new Date(b.start as string).getTime());

  try {
    res.json(GetProductionsTodayResponse.parse(productions));
  } catch (err) {
    req.log.error({ err }, "Bookings API response failed schema validation");
    res.status(502).json({ error: "Bookings API returned an unexpected response" });
  }
});

export default router;
