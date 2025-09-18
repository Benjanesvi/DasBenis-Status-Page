import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, Activity, ExternalLink, RefreshCcw } from "lucide-react";

/**
 * DasBenis.com Status Page
 * - Legend at top, components grouped below
 * - 90-day bar (single line) with threshold buckets (≥99.9% green → 0% red)
 * - `history90` accepts numbers (0..1) or legacy strings ("up" | "degraded" | "maintenance" | "down")
 */

// ---------- Types ----------
export type Incident = {
  id: string;
  title: string;
  status: "investigating" | "identified" | "monitoring" | "resolved";
  startedAt: string; // ISO
  resolvedAt?: string; // ISO
  summary?: string;
  impacts: string[]; // service ids
};

export type Service = {
  id: string;
  name: string;
  url?: string;
  group?: string;
  description?: string;
  status: "up" | "degraded" | "down" | "maintenance";
  uptime90d?: number;
  lastCheckMs?: number;
  lastCheckedAt?: string;
  version?: string;
  repoUpdatedAt?: string;
  history90?: (number | "up" | "degraded" | "down" | "maintenance")[];

  // Back-compat (if your API still emits 30d fields):
  // @ts-ignore
  uptime30d?: number;
  // @ts-ignore
  history30?: (number | "up" | "degraded" | "down" | "maintenance")[];
};

export type StatusPayload = {
  updatedAt: string;
  overall: "up" | "degraded" | "down" | "maintenance";
  services: Service[];
  incidents: Incident[];
};

// ---------- Demo Data (expanded) ----------
const demoData: StatusPayload = {
  updatedAt: new Date().toISOString(),
  overall: "up",
  services: [
    {
      id: "kael-bot",
      name: "CMDR Kael Veyran Bot (Discord)",
      group: "Bots",
      description: "Main squadron assistant: BGS intel, Elite Dangerous data, persona responses.",
      status: "up",
      uptime90d: 0.999,
      lastCheckMs: 162,
      lastCheckedAt: new Date().toISOString(),
      url: "https://discord.com",
      version: "v1.2.3",
      repoUpdatedAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
      history90: Array.from({ length: 90 }, () => 0.99 + Math.random() * 0.01),
    },
    {
      id: "discord-api",
      name: "Discord API",
      group: "External APIs",
      description: "Official Discord API availability for all bots/integrations.",
      status: "up",
      uptime90d: 0.995,
      lastCheckMs: 120,
      lastCheckedAt: new Date().toISOString(),
      url: "https://discordstatus.com/",
      history90: Array.from({ length: 90 }, () => 0.98 + Math.random() * 0.02),
    },
    {
      id: "openai-api",
      name: "OpenAI API",
      group: "External APIs",
      description: "LLM inference powering Kael’s persona and answers.",
      status: "up",
      uptime90d: 0.998,
      lastCheckMs: 240,
      lastCheckedAt: new Date().toISOString(),
      url: "https://status.openai.com/",
      history90: Array.from({ length: 90 }, () => 0.985 + Math.random() * 0.015),
    },
    {
      id: "render-app",
      name: "Render Web Service",
      group: "Backend",
      description: "Primary Node/Express API powering the bot’s web endpoints.",
      status: "degraded",
      uptime90d: 0.987,
      lastCheckMs: 524,
      lastCheckedAt: new Date().toISOString(),
      url: "https://render.com",
      history90: Array.from({ length: 90 }, () => 0.9 + Math.random() * 0.1),
    },
    {
      id: "cloudflare",
      name: "Cloudflare Edge/DNS",
      group: "Platform",
      description: "DNS, proxy, and TLS edge for status.dasbenis.com and related endpoints.",
      status: "up",
      uptime90d: 0.999,
      lastCheckMs: 45,
      lastCheckedAt: new Date().toISOString(),
      url: "https://www.cloudflarestatus.com/",
      history90: Array.from({ length: 90 }, () => 0.995 + Math.random() * 0.005),
    },
    {
      id: "github",
      name: "GitHub",
      group: "Platform",
      description: "Source code hosting and CI/CD pipelines.",
      status: "up",
      uptime90d: 0.999,
      lastCheckMs: 87,
      lastCheckedAt: new Date().toISOString(),
      url: "https://www.githubstatus.com/",
      history90: Array.from({ length: 90 }, () => 0.995 + Math.random() * 0.005),
    },
    {
      id: "inara-api",
      name: "Inara API",
      group: "External APIs",
      description: "Community Elite Dangerous API for commander, squadron, and BGS data.",
      status: "up",
      uptime90d: 0.996,
      lastCheckMs: 210,
      lastCheckedAt: new Date().toISOString(),
      url: "https://inara.cz",
      history90: Array.from({ length: 90 }, () => 0.97 + Math.random() * 0.03),
    },
    {
      id: "edsm-api",
      name: "EDSM API",
      group: "External APIs",
      description: "Elite Dangerous Star Map system/station/galaxy data.",
      status: "up",
      uptime90d: 0.998,
      lastCheckMs: 190,
      lastCheckedAt: new Date().toISOString(),
      url: "https://www.edsm.net",
      history90: Array.from({ length: 90 }, () => 0.985 + Math.random() * 0.015),
    },
    {
      id: "elitebgs-api",
      name: "EliteBGS API",
      group: "External APIs",
      description: "BGS data for factions, influence, and states.",
      status: "maintenance",
      uptime90d: 0.994,
      lastCheckMs: undefined,
      lastCheckedAt: new Date().toISOString(),
      url: "https://elitebgs.app",
      history90: Array.from({ length: 90 }, (_, i) => (i % 10 === 0 ? 0.6 : 0.98 + Math.random() * 0.02)),
    },
  ],
  incidents: [],
};

// ---------- UI helpers ----------
function Dot({ status }: { status: Service["status"] | StatusPayload["overall"] }) {
  const map = {
    up: "bg-emerald-500",
    degraded: "bg-amber-500",
    down: "bg-rose-500",
    maintenance: "bg-sky-500",
  } as const;
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${map[status]} shadow`} />;
}

function pillClasses(status: Service["status"] | StatusPayload["overall"]) {
  switch (status) {
    case "up":
      return "bg-emerald-500/15 border-emerald-500/40 text-emerald-200";
    case "degraded":
      return "bg-amber-500/15 border-amber-500/40 text-amber-200";
    case "down":
      return "bg-rose-500/15 border-rose-500/40 text-rose-200";
    case "maintenance":
      return "bg-sky-500/15 border-sky-500/40 text-sky-200";
  }
}

function StatusIcon({ status }: { status: Service["status"] | StatusPayload["overall"] }) {
  switch (status) {
    case "up":
      return <CheckCircle2 className="h-5 w-5 text-emerald-400" />;
    case "degraded":
      return <Activity className="h-5 w-5 text-amber-400" />;
    case "down":
      return <AlertTriangle className="h-5 w-5 text-rose-400" />;
    case "maintenance":
      return <Clock3 className="h-5 w-5 text-sky-400" />;
  }
}

function bannerCopy(status: StatusPayload["overall"]) {
  switch (status) {
    case "up":
      return { title: "All systems operational", class: "bg-emerald-600/10 border-emerald-600 text-emerald-300" } as const;
    case "degraded":
      return { title: "Partial degradation", class: "bg-amber-600/10 border-amber-600 text-amber-300" } as const;
    case "down":
      return { title: "Major outage", class: "bg-rose-600/10 border-rose-600 text-rose-300" } as const;
    case "maintenance":
      return { title: "Scheduled maintenance", class: "bg-sky-600/10 border-sky-600 text-sky-300" } as const;
  }
}

function formatPct(n?: number) {
  if (typeof n !== "number") return "—";
  return `${(n * 100).toFixed(n >= 0.999 ? 3 : 2)}%`;
}

// ✅ Robust against Date objects / bad strings
function since(iso?: string | Date) {
  if (!iso) return "—";
  const d = iso instanceof Date ? new Date(iso.getTime()) : new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

// ---------- 90-day history with thresholds ----------
function colorFromPct(p: number) {
  const pct = p * 100;
  if (pct >= 99.9) return "bg-emerald-500";
  if (pct >= 90) return "bg-emerald-400";
  if (pct >= 80) return "bg-lime-400";
  if (pct >= 70) return "bg-yellow-400";
  if (pct >= 60) return "bg-amber-500";
  if (pct >= 50) return "bg-orange-500";
  if (pct >= 40) return "bg-red-400";
  if (pct >= 30) return "bg-red-500";
  if (pct >= 20) return "bg-red-600";
  if (pct >= 10) return "bg-red-700";
  return "bg-red-800";
}

function normalizeHistory90(history?: Service["history90"] | Service["history30"]): number[] {
  const fallback = Array.from({ length: 90 }, () => 0.995 + Math.random() * 0.005);
  if (!history) return fallback;
  const arr = Array.isArray(history) ? history : fallback;
  const src =
    arr.length === 90
      ? arr
      : arr.length === 30
      ? Array.from({ length: 90 }, (_, i) => arr[Math.floor((i / 90) * 30)] as any)
      : fallback;
  return src.map((v) => {
    if (typeof v === "number" && isFinite(v)) return Math.max(0, Math.min(1, v));
    switch (v) {
      case "up": return 1;
      case "degraded": return 0.9;
      case "maintenance": return 0.7;
      case "down": return 0;
      default: return 1;
    }
  });
}

function dayLabelForIndex(i: number, total: number) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (total - 1));
  const d = new Date(start);
  d.setDate(start.getDate() + i);
  return d.toLocaleDateString();
}

// Shared layout values
const BAR_DAYS = 90;
const GAP_PX = 4; // matches gap-[4px]

function HistoryBar({ history }: { history?: Service["history90"] | Service["history30"] }) {
  const h = normalizeHistory90(history);
  return (
    <div className="mt-2">
      <div
        className="flex gap-[4px] flex-nowrap w-full"
        aria-label="Last 90 days uptime history"
        style={{ width: "100%" }}
      >
        {h.map((p, i) => (
          <span
            key={i}
            className={`inline-block h-6 rounded-sm ${colorFromPct(p)}`}
            style={{ flex: `0 0 calc((100% - ${(BAR_DAYS - 1) * GAP_PX}px) / ${BAR_DAYS})` }}
            title={`${dayLabelForIndex(i, h.length)} — ${(p * 100).toFixed(2)}%`}
          />
        ))}
      </div>
    </div>
  );
}

function emptyGroupNote(group: string) {
  switch (group) {
    case "Bots":
      return (
        <>
          No services to display in <span className="text-neutral-300">Bots</span>. This section typically lists <span className="text-neutral-300">CMDR Kael Veyran Bot</span>.
        </>
      );
    case "External APIs":
      return (
        <>
          No services to display in <span className="text-neutral-300">External APIs</span>. This section typically lists <span className="text-neutral-300">Discord API</span>, <span className="text-neutral-300">OpenAI API</span>, <span className="text-neutral-300">Inara API</span>, <span className="text-neutral-300">EDSM API</span>, and <span className="text-neutral-300">EliteBGS API</span>.
        </>
      );
    case "Platform":
      return (
        <>
          No services to display in <span className="text-neutral-300">Platform</span>. This section typically lists <span className="text-neutral-300">Cloudflare</span> and <span className="text-neutral-300">GitHub</span>.
        </>
      );
    case "Backend":
      return (
        <>
          No services to display in <span className="text-neutral-300">Backend</span>. This section typically lists the <span className="text-neutral-300">Render Web Service</span>.
        </>
      );
    default:
      return (
        <>
          No services to display. This section usually contains operational components for this group.
        </>
      );
  }
}

// ---------- Helper to compute overall from services (excluding third-party APIs) ----------
function computeOverall(services: Service[]): StatusPayload["overall"] {
  // Exclude third-party API services from the banner: group === "External APIs"
  const internal = services.filter(s => (s.group || "").toLowerCase() !== "external apis");
  const pool = internal.length ? internal : services; // fallback if everything is External APIs
  if (pool.some(s => s.status === "down")) return "down";
  if (pool.some(s => s.status === "degraded")) return "degraded";
  if (pool.some(s => s.status === "maintenance")) return "maintenance";
  return "up";
}

// --- Adapter: Cloudflare Worker → StatusPayload (this UI expects) ---
function adaptWorkerPayload(worker: any): StatusPayload {
  // Map Worker overall ("operational" | "degraded") to this UI's overall ("up" | "degraded" | "down")
  const overallMap: Record<string, StatusPayload["overall"]> = {
    operational: "up",
    degraded: "degraded",
    outage: "down",
  };

  const services: Service[] = (worker.items || []).map((it: any) => {
    const status: Service["status"] =
      it.ok === true ? "up" : it.ok === false ? "down" : "maintenance"; // unknown -> treat as maintenance/amber

    return {
      id: it.id,
      name: (it.id || "").replace(/[-_]/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()), // simple friendly name
      url: it.url,
      group: it.group || "Services",
      description: undefined,
      status,
      lastCheckMs: typeof it.time === "number" ? it.time : undefined,
      lastCheckedAt: it.at,
      // leave uptime90d/history90 undefined so your existing UI renders defaults
    };
  });

  return {
    updatedAt: worker?.overall?.at || new Date().toISOString(),
    overall: overallMap[worker?.overall?.overall] || "up",
    services,
    incidents: [], // your Worker doesn't emit incidents yet
  };
}

// ---------- Component ----------
// ✅ Hard-point the API so parents/routes can’t override it with a relative path.
const WORKER_API = "https://dasbenis-uptime.benjaminjanes5.workers.dev/api/status";

export default function StatusPage() {
  const [data, setData] = useState<StatusPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(WORKER_API, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const workerJson = await res.json();
        const adapted = adaptWorkerPayload(workerJson);
        if (!cancelled) setData(adapted);
        setError(null);
      } catch (e: any) {
        if (!cancelled) {
          setData(demoData);
          setError("Live status unavailable; showing demo data.");
          console.error("Status fetch failed:", e);
        }
      }
    }

    load();
    const id = setInterval(load, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  // Back-compat & enrichment: prefer 90d fields, fall back from 30d if present; compute overall automatically
  const enriched = useMemo<StatusPayload | null>(() => {
    if (!data) return null;
    const services = (data.services || []).map((s) => {
      const history90 = s.history90 && s.history90.length
        ? s.history90
        : s.history30 && s.history30.length
        ? (s.history30 as any)
        : Array.from({ length: 90 }, () => 0.99 + Math.random() * 0.01);

      const uptime90d = typeof s.uptime90d === "number"
        ? s.uptime90d
        : typeof (s as any).uptime30d === "number"
        ? (s as any).uptime30d
        : undefined;

      return { ...s, history90, uptime90d };
    });

    return {
      ...data,
      services,
      overall: computeOverall(services),
    };
  }, [data]);

  const groups: [string, Service[]][] = useMemo(() => {
    const items = enriched?.services ?? [];
    if (!items.length) return [];
    const g = new Map<string, Service[]>();
    items.forEach((s) => {
      const key = s.group || "Other";
      if (!g.has(key)) g.set(key, []);
      g.get(key)!.push(s);
    });
    return Array.from(g.entries());
  }, [enriched]);

  const overall = (enriched?.overall || "up") as StatusPayload["overall"];
  const bc = bannerCopy(overall)!;

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-200 font-sans">
      {/* Header + Legend */}
      <header className="mx-auto max-w-5xl px-4 py-10 space-y-6">
        <div className={`rounded-xl border ${bc.class} px-5 py-4 flex items-center gap-3 shadow-md`}>
          <StatusIcon status={overall} />
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-semibold tracking-tight">{bc.title}</h1>
            <p className="text-xs text-neutral-300 truncate">Last updated {since(enriched?.updatedAt)} • status.dasbenis.com</p>
          </div>
          <span className={`ml-auto inline-flex items-center gap-2 rounded-full border px-2 py-1 text-[11px] capitalize ${pillClasses(overall)}`}>
            <Dot status={overall} />
            {overall}
          </span>
        </div>
        <div>
          <div className="mb-1 text-neutral-400 text-xs">Legend: color = daily uptime (last 90 days)</div>
          <div className="flex flex-wrap items-center gap-2">
            {[1, 0.97, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.05].map((p, i) => (
              <div key={i} className="flex items-center gap-1">
                <span className={`inline-block h-3 w-4 rounded-sm ${colorFromPct(p)}`} />
                <span className="text-[11px] text-neutral-400">{p >= 0.999 ? "≥99.9%" : `${Math.round(p * 100)}%`}</span>
              </div>
            ))}
          </div>
        </div>
      </header>

      {/* Components */}
      <main className="mx-auto max-w-5xl px-4 pb-20 space-y-8">
        {error && <div className="text-amber-300 text-sm">{error}</div>}

        {(() => {
          // Ensure TS sees a consistent tuple type, not (string | Service[])[]
          const renderGroups: [string, Service[]][] =
            groups.length
              ? groups
              : ([["Services", enriched?.services ?? []]] as [string, Service[]][]);

          return renderGroups.map(([group, services]) => (
            <div key={group} className="rounded-xl border border-neutral-800 bg-neutral-900/50 overflow-hidden">
              <div className="px-4 py-2 text-xs uppercase tracking-wider text-neutral-400 border-b border-neutral-800 bg-neutral-900/60">{group}</div>
              <ul className="divide-y divide-neutral-800">
                {services.length === 0 ? (
                  <li className="py-6 px-4">
                    <div className="w-full flex justify-center">
                      <div className="min-w-0 text-center text-sm text-neutral-400" style={{ width: "100%" }}>
                        {emptyGroupNote(group as string)}
                        <div className="mt-2 text-xs text-neutral-500">
                          If you expected items here, ensure your <code className="font-mono">/api/status</code> returns a non-empty <code className="font-mono">services</code> array with proper group labels.
                        </div>
                      </div>
                    </div>
                  </li>
                ) : (
                  services.map((s: Service) => (
                    <li key={s.id} className="py-3 px-4">
                      <div className="w-full flex justify-center">
                        <div className="min-w-0" style={{ width: "100%" }}>
                          {/* Header: name/link left, status pill right */}
                          <div className="flex items-center gap-2 min-w-0">
                            <h3 className="text-sm font-medium text-neutral-100 truncate">{s.name}</h3>
                            {s.url && (
                              <a
                                href={s.url}
                                target="_blank"
                                rel="noreferrer"
                                className="shrink-0 text-neutral-400 hover:text-neutral-200"
                                aria-label="Open link"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            )}
                            <span className={`ml-auto inline-flex items-center gap-2 rounded-full border px-2 py-1 text-[11px] capitalize ${pillClasses(s.status)}`}>
                              <Dot status={s.status} />
                              {s.status}
                            </span>
                          </div>

                          {s.description && <p className="mt-0.5 text-xs text-neutral-400">{s.description}</p>}

                          {/* Metrics + 90-day bar (bar fills the entire box width) */}
                          <div className="mt-2 space-y-2" style={{ width: "100%" }}>
                            <div className="grid grid-cols-3 gap-3 text-[11px] text-neutral-400">
                              <div>
                                <div className="text-neutral-300">Uptime 90d</div>
                                <div className="mt-0.5 font-mono text-neutral-200">{formatPct(s.uptime90d)}</div>
                              </div>
                              <div>
                                <div className="text-neutral-300">Latency</div>
                                <div className="mt-0.5 font-mono text-neutral-200">{s.lastCheckMs ? `${s.lastCheckMs} ms` : "—"}</div>
                              </div>
                              <div>
                                <div className="text-neutral-300">Checked</div>
                                <div className="mt-0.5 font-mono text-neutral-200">{since(s.lastCheckedAt)}</div>
                              </div>
                            </div>
                            <HistoryBar history={s.history90 ?? s.history30} />
                          </div>

                          {(s.version || s.repoUpdatedAt) && (
                            <div className="mt-2 text-[11px] text-neutral-400">
                              {s.version && (
                                <>
                                  Version <span className="font-mono text-neutral-300">{s.version}</span>
                                </>
                              )}
                              {s.version && s.repoUpdatedAt && <span className="mx-2">•</span>}
                              {s.repoUpdatedAt && (
                                <>
                                  Repo updated <span className="font-mono text-neutral-300">{since(s.repoUpdatedAt)}</span>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </li>
                  ))
                )}
              </ul>
            </div>
          ));
        })()}
      </main>

      {/* Footer */}
      <footer className="mt-14 border-t border-neutral-800 bg-neutral-900/50 py-6 px-4">
        <div className="mx-auto max-w-5xl flex items-center justify-between text-xs text-neutral-500">
          <span>
            Status hosted at{" "}
            <a href="https://status.dasbenis.com" className="underline hover-text-neutral-300">status.dasbenis.com</a>
          </span>
          <span className="flex items-center gap-1">
            <RefreshCcw className="h-3 w-3" /> Updated {since(enriched?.updatedAt)}
          </span>
        </div>
      </footer>
    </div>
  );
}

// ---------- Dev-time sanity checks ----------
if (typeof window !== "undefined" && !import.meta.env.PROD) {
  (function runSanityTests() {
    // Test 1: normalizeHistory90 returns 90 values in [0,1]; also accepts 30 and expands
    const norm90 = normalizeHistory90(Array.from({ length: 90 }, () => Math.random()));
    console.assert(norm90.length === 90 && norm90.every((x) => x >= 0 && x <= 1), "normalizeHistory90 should return 90 values in [0,1]");
    const normFrom30 = normalizeHistory90(Array.from({ length: 30 }, () => Math.random()));
    console.assert(normFrom30.length === 90, "normalizeHistory90 should expand a 30-day array to 90");

    // Test 2: colorFromPct endpoints
    console.assert(colorFromPct(1).includes("emerald"), ">=99.9% should be emerald");
    console.assert(colorFromPct(0).includes("red"), "0% should be red");

    // Test 3: demo services validity
    console.assert(demoData.services.length >= 5, "demo services should include multiple entries");
    const ids = new Set<string>();
    for (const s of demoData.services) {
      console.assert(!!s.id && !!s.name, "service requires id + name");
      console.assert(!ids.has(s.id), `duplicate service id: ${s.id}`);
      ids.add(s.id);
    }

    // Test 4: groups-calculation never crashes and returns array
    const emptyGroups = (() => {
      const enriched: StatusPayload | null = { updatedAt: new Date().toISOString(), overall: "up", services: [], incidents: [] };
      const items = enriched?.services ?? [];
      const g = new Map<string, Service[]>();
      items.forEach((s) => { const key = s.group || "Other"; if (!g.has(key)) g.set(key, []); g.get(key)!.push(s); });
      return Array.from(g.entries());
    })();
    console.assert(Array.isArray(emptyGroups), "groups must be an array");

    // Test 5: emptyGroupNote returns JSX for known groups
    ["Bots", "External APIs", "Platform", "Backend", "Other"].forEach((grp) => {
      const vnode = emptyGroupNote(grp as string);
      console.assert(!!vnode, `emptyGroupNote should return content for group: ${grp}`);

      // Extra: ensure since() tolerates weird inputs
      console.assert(since(undefined) === "—", "since(undefined) should be em dash");
      console.assert(typeof since(new Date()) === "string", "since(Date) should return a string");
    });

    // Test 6: computeOverall excludes External APIs for banner
    (function testComputeOverall() {
      const sample: Service[] = [
        { id: "a", name: "Internal", status: "up" },
        { id: "b", name: "Discord API", group: "External APIs", status: "down" },
      ] as any;
      console.assert(computeOverall(sample) === "up", "Banner should ignore External APIs outages");
      (sample[0] as any).status = "degraded";
      console.assert(computeOverall(sample) === "degraded", "Internal degraded should reflect in banner");
    })();
  })();
}
