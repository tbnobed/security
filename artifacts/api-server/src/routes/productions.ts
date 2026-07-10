import { Router } from "express";
import { GetProductionsResponse } from "@workspace/api-zod";
import { requireOperator } from "../lib/auth";
import type { Logger } from "pino";

const router = Router();

const DEFAULT_BOOKINGS_API_URL = "https://plex.bookstud.io/api/public/bookings";

type Range = "today" | "week" | "month";

// Time window (server-local TZ; set TZ on the api container, defaults to UTC).
// All windows start at the beginning of today — a security desk cares about
// today + upcoming productions, not past ones.
function rangeWindow(range: Range): { start: string; end: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  let end: Date;
  if (range === "week") {
    // Today plus the next 6 days (7-day window incl. today).
    end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 6, 23, 59, 59, 999);
  } else if (range === "month") {
    // Today through the end of the current calendar month.
    end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  } else {
    end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  }
  return { start: start.toISOString(), end: end.toISOString() };
}

// The bookings API only returns a numeric studioId. The sibling studios
// endpoint (origin + /api/studios) maps those ids to human names. Cache the map
// briefly so the dashboard's frequent polling doesn't hammer the upstream.
let studiosCache: { map: Map<number, string>; at: number } | null = null;
const STUDIOS_TTL_MS = 5 * 60 * 1000;

function studiosUrl(bookingsBaseUrl: string): string | null {
  if (process.env.BOOKINGS_STUDIOS_API_URL) return process.env.BOOKINGS_STUDIOS_API_URL;
  try {
    return new URL(bookingsBaseUrl).origin + "/api/studios";
  } catch {
    return null;
  }
}

async function fetchStudioMap(bookingsBaseUrl: string, log: Logger): Promise<Map<number, string>> {
  if (studiosCache && Date.now() - studiosCache.at < STUDIOS_TTL_MS) {
    return studiosCache.map;
  }
  const url = studiosUrl(bookingsBaseUrl);
  const map = new Map<number, string>();
  if (!url) return map;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) {
      log.warn({ status: response.status }, "Studios API returned non-OK status");
      return studiosCache?.map ?? map;
    }
    const data: unknown = await response.json();
    if (!Array.isArray(data)) {
      log.warn("Studios API did not return an array; keeping existing mapping");
      return studiosCache?.map ?? map;
    }
    for (const s of data) {
      const item = s as Record<string, unknown>;
      if (typeof item.id === "number" && typeof item.name === "string") {
        map.set(item.id, item.name);
      }
    }
    studiosCache = { map, at: Date.now() };
    return map;
  } catch (err) {
    log.warn({ err }, "Failed to fetch studios for name mapping");
    // Fall back to any stale cache so names still resolve on a transient blip.
    return studiosCache?.map ?? map;
  } finally {
    clearTimeout(timeout);
  }
}

router.get("/productions", requireOperator, async (req, res): Promise<void> => {
  const baseUrl = process.env.BOOKINGS_API_URL ?? DEFAULT_BOOKINGS_API_URL;
  const rangeParam = req.query.range;
  const range: Range =
    rangeParam === "week" || rangeParam === "month" ? rangeParam : "today";
  const { start, end } = rangeWindow(range);

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
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(upstream, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
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
  } finally {
    clearTimeout(timeout);
  }

  if (!Array.isArray(raw)) {
    req.log.error("Bookings API did not return an array");
    res.status(502).json({ error: "Bookings API returned an unexpected response" });
    return;
  }

  const studioMap = await fetchStudioMap(baseUrl, req.log);
  const rangeStart = new Date(start).getTime();
  const rangeEnd = new Date(end).getTime();

  const productions = raw
    .map((b) => {
      const item = b as Record<string, unknown>;
      const studioId = typeof item.studioId === "number" ? item.studioId : null;
      return {
        id: item.id,
        title: item.title,
        description: item.description ?? null,
        start: item.start,
        end: item.end,
        studioId,
        studioName: studioId !== null ? (studioMap.get(studioId) ?? null) : null,
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
      // Keep only bookings that actually overlap the requested window
      // (the upstream API returns some out-of-range items).
      const bStart = new Date(b.start as string).getTime();
      const bEnd = new Date(b.end as string).getTime();
      if (Number.isNaN(bStart) || Number.isNaN(bEnd)) return false;
      return bStart <= rangeEnd && bEnd >= rangeStart;
    })
    .sort((a, b) => new Date(a.start as string).getTime() - new Date(b.start as string).getTime());

  try {
    res.json(GetProductionsResponse.parse(productions));
  } catch (err) {
    req.log.error({ err }, "Bookings API response failed schema validation");
    res.status(502).json({ error: "Bookings API returned an unexpected response" });
  }
});

export default router;
