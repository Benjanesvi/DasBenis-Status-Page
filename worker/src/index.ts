export interface Env {
  STATUS_KV: KVNamespace;
}

// ---- CONFIG ----
// These are the endpoints we'll ping for live status.
const TARGETS = [
  // Elite: Dangerous ecosystem
  { id: "inara",            group: "APIs",      url: "https://inara.cz/inapi/v1/" },
  { id: "elitebgs",         group: "APIs",      url: "https://elitebgs.app/api/ebgs/v5/factions" },
  { id: "edsm",             group: "APIs",      url: "https://www.edsm.net/en/api-status-v1" },

  // Your own resources
  { id: "kael-bot-render",  group: "Render",    url: "https://cmdr-kael-status.onrender.com" },
  { id: "github-cmdr-kael", group: "GitHub",    url: "https://github.com/Benjanesvi/CMDR-Kael-Bot" },
  { id: "cloudflare-domain",group: "Cloudflare",url: "https://dasbenis.com" },
  { id: "upstash-kael",     group: "Upstash",   url: "https://warm-hornet-64121.upstash.io" },

  // (Optional) keep your public status page too
  { id: "site",             group: "Public",    url: "https://dasbenis-status-page.pages.dev/" },
];

const TIMEOUT_MS = 8000;
const FRESH_TTL = 300;

// Central CORS headers (allow your Pages site or keep "*" while testing)
const CORS = {
  "access-control-allow-origin": "*",              // later: set to your Pages domain for stricter CORS
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type,authorization",
};

function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...CORS, ...extra },
  });
}

function ok(text = "OK", extra: Record<string, string> = {}) {
  return new Response(text, { status: 200, headers: { ...CORS, ...extra } });
}

async function fetchWithTimeout(url: string, ms: number) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort("timeout"), ms);
  const t0 = Date.now();
  try {
    const res = await fetch(url, { method: "GET", signal: ctrl.signal, cf: { cacheTtl: 0 } });
    return { ok: res.ok, status: res.status, time: Date.now() - t0, error: null as string | null };
  } catch (e: any) {
    return { ok: false, status: 0, time: Date.now() - t0, error: String(e?.message ?? e) };
  } finally {
    clearTimeout(t);
  }
}

export default {
  // CRON: live checks every schedule tick
  async scheduled(_evt: ScheduledEvent, env: Env) {
    await Promise.all(TARGETS.map(async (t) => {
      const r = await fetchWithTimeout(t.url, TIMEOUT_MS);
      const record = { id: t.id, group: t.group, url: t.url, ...r, at: new Date().toISOString() };
      await env.STATUS_KV.put(`status:${t.id}`, JSON.stringify(record), { expirationTtl: FRESH_TTL * 3 });
    }));

    const all = await Promise.all(TARGETS.map(t => env.STATUS_KV.get(`status:${t.id}`, "json") as Promise<any>));
    const healthy = all.length && all.every(r => r?.ok === true);
    await env.STATUS_KV.put("status:overall", JSON.stringify({
      overall: healthy ? "operational" : "degraded",
      at: new Date().toISOString(),
    }), { expirationTtl: FRESH_TTL });
  },

  // HTTP API
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    // --- CORS preflight ---
    if (req.method === "OPTIONS") {
      return ok(); // empty 200 with CORS headers
    }

    // --- Public: current status JSON ---
    if (url.pathname === "/api/status" && req.method === "GET") {
      const items = await Promise.all(TARGETS.map(async (t) => {
        const v = await env.STATUS_KV.get(`status:${t.id}`, "json") as any;
        return v ?? { id: t.id, group: t.group, url: t.url, ok: null };
      }));
      const overall = await env.STATUS_KV.get("status:overall", "json");
      return json({ overall, items }, 200, { "cache-control": "public, max-age=20" });
    }

    // --- Manual trigger: run checks now ---
    if (url.pathname === "/api/run-now" && req.method === "POST") {
      await Promise.all(TARGETS.map(async (t) => {
        const r = await fetchWithTimeout(t.url, TIMEOUT_MS);
        const record = { id: t.id, group: t.group, url: t.url, ...r, at: new Date().toISOString() };
        await env.STATUS_KV.put(`status:${t.id}`, JSON.stringify(record), { expirationTtl: FRESH_TTL * 3 });
      }));

      const all = await Promise.all(TARGETS.map(t => env.STATUS_KV.get(`status:${t.id}`, "json") as Promise<any>));
      const healthy = all.length && all.every(r => r?.ok === true);
      await env.STATUS_KV.put("status:overall", JSON.stringify({
        overall: healthy ? "operational" : "degraded",
        at: new Date().toISOString(),
      }), { expirationTtl: FRESH_TTL });

      return json({ ok: true });
    }

    // Fallback
    return ok();
  }
};
