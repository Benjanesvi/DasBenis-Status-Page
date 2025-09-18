export interface Env {
  STATUS_KV: KVNamespace;
}

// EDIT these to your real endpoints
const TARGETS = [
  { id: "site", url: "https://dasbenis-status-page.pages.dev/", group: "Public" },
  // { id: "api",  url: "https://your-api.example.com/health", group: "Backend" },
];

const TIMEOUT_MS = 8000;
const FRESH_TTL = 300;

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

  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === "/api/status") {
      const items = await Promise.all(TARGETS.map(async (t) => {
        const v = await env.STATUS_KV.get(`status:${t.id}`, "json") as any;
        return v ?? { id: t.id, group: t.group, url: t.url, ok: null };
      }));
      const overall = await env.STATUS_KV.get("status:overall", "json");
      return new Response(JSON.stringify({ overall, items }), {
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "public, max-age=20",
          "access-control-allow-origin": "*",
        },
      });
    }
    if (url.pathname === "/api/run-now" && req.method === "POST") {
  // run the same loop the cron uses
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

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "content-type": "application/json" }
  });
}
    return new Response("OK", { status: 200 });
  }
};
