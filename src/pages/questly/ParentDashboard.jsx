import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowDownCircle, ArrowUpCircle, ClipboardCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { ErrorView, Loading } from "@/components/questly/ApiState";
import HistoryList from "@/components/questly/HistoryList";
import { api, fmtMoney, fmtPoints, notifyApprovalsChanged, notifyPointsChanged } from "@/lib/questlyApi";

const QUICK = [100, 500, 1000, 5000];

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

function summaryParts(sum, keys) {
  const parts = [];
  if (sum.done) parts.push(`✅ ${plural(sum.done, "hecha", "hechas")}`);
  if (sum.pending) parts.push(`⏳ ${plural(sum.pending, "por revisar", "por revisar")}`);
  if (sum.rejected) parts.push(`🚫 ${plural(sum.rejected, "rechazada", "rechazadas")}`);
  if (sum.pending_review) parts.push(`⚠️ ${plural(sum.pending_review, "sin registrar", "sin registrar")}`);
  if (sum.missed) parts.push(`❌ ${plural(sum.missed, "no realizada", "no realizadas")}`);
  if (sum.not_applicable) parts.push(`➖ ${plural(sum.not_applicable, "no aplica", "no aplica")}`);
  if (keys.includes("open") && sum.open) parts.push(`👉 ${plural(sum.open, "por hacer", "por hacer")}`);
  return parts;
}

// Dashboard del adulto: estado de cada niño con su resumen de AYER y HOY,
// pendientes de aprobación y actividad.
export default function ParentDashboard() {
  const { toast } = useToast();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [awards, setAwards] = useState({}); // kidId -> {amount, reason}

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await api("/parent/dashboard"));
    } catch (e) {
      setError(e);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const setAward = (kidId, patch) =>
    setAwards((a) => ({ ...a, [kidId]: { amount: "", reason: "", ...a[kidId], ...patch } }));

  const award = async (kid, negate) => {
    const form = awards[kid.id] || {};
    const amount = Number(form.amount);
    if (!amount) {
      toast({ title: "Elige una cantidad primero.", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const res = await api("/parent/award", {
        method: "POST",
        body: { kid_id: kid.id, amount, reason: form.reason, negate },
      });
      toast({ title: res.message });
      setAward(kid.id, { amount: "", reason: "" });
      notifyPointsChanged();
      await load();
    } catch (e) {
      toast({ title: "Ups", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  if (error) return <ErrorView error={error} onRetry={load} />;
  if (!data) return <Loading label="Preparando el panel…" />;

  const claimsSample = data.claims.slice(0, 3);
  const redemptionsSample = data.redemptions.slice(0, 3);
  const reviewSample = (data.reviews || []).slice(0, 3);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-extrabold">Panel de la familia</h1>
        <Link to="/parent/today" className="text-sm font-semibold text-violet-700">Ver ayer y hoy →</Link>
      </div>

      {data.pin_requests?.length ? (
        <Link to="/parent/settings"
          className="block rounded-2xl bg-amber-50 border border-amber-200 p-4 text-sm font-semibold text-amber-800 hover:bg-amber-100 transition-colors">
          🔔 {data.pin_requests.map((r) => r.kid_name).join(", ")}{" "}
          {data.pin_requests.length === 1 ? "solicitó" : "solicitaron"} restablecer su PIN —
          revísalo en Configuración → Seguridad.
        </Link>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2">
        {data.kids.map((kid) => {
          const form = awards[kid.id] || {};
          const yesterday = summaryParts(kid.yesterday || {}, []);
          const today = summaryParts(kid.today || {}, ["open"]);
          return (
            <div key={kid.id} className="rounded-2xl bg-white border border-slate-100 shadow-sm p-5 relative overflow-hidden">
              <span className="absolute inset-y-0 left-0 w-1.5" style={{ backgroundColor: kid.color || "#7c4dff" }} />
              <div className="flex items-center gap-3">
                <span className="h-12 w-12 rounded-full grid place-items-center text-2xl"
                  style={{ backgroundColor: (kid.color || "#7c4dff") + "2e" }}>
                  {kid.avatar}
                </span>
                <div>
                  <Link to={`/parent/kids/${kid.id}`} className="font-bold hover:underline">{kid.name}</Link>
                  <p className="text-xs text-muted-foreground">
                    ⭐ {fmtPoints(kid.points)} · {fmtMoney(kid.points)} · total ganado {fmtPoints(kid.lifetime_points)}
                  </p>
                </div>
              </div>

              <div className="mt-3 text-xs text-slate-600 space-y-1">
                <p>
                  <span className="font-bold">📅 Ayer:</span>{" "}
                  {yesterday.length ? yesterday.join(" · ") : "sin quests"}
                </p>
                <p>
                  <span className="font-bold">🔥 Hoy:</span>{" "}
                  {today.length ? today.join(" · ") : "sin quests"}
                </p>
              </div>

              <div className="mt-3 flex gap-2">
                <Input type="number" placeholder="Puntos" className="w-24"
                  value={form.amount || ""} onChange={(e) => setAward(kid.id, { amount: e.target.value })} />
                <Input placeholder="Razón (opcional)" className="flex-1"
                  value={form.reason || ""} onChange={(e) => setAward(kid.id, { reason: e.target.value })} />
              </div>
              <div className="mt-2 flex gap-2 flex-wrap">
                {QUICK.map((q) => (
                  <button key={q} type="button" onClick={() => setAward(kid.id, { amount: String(q) })}
                    className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold hover:bg-slate-200">
                    {fmtPoints(q)}
                  </button>
                ))}
                <div className="ml-auto flex gap-2">
                  <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" disabled={busy}
                    onClick={() => award(kid, false)}>
                    <ArrowUpCircle className="h-4 w-4 mr-1" /> Dar
                  </Button>
                  <Button size="sm" variant="outline" disabled={busy}
                    onClick={() => award(kid, true)}>
                    <ArrowDownCircle className="h-4 w-4 mr-1" /> Quitar
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
        {!data.kids.length ? (
          <div className="rounded-2xl bg-white border border-slate-100 shadow-sm p-6 text-center text-sm text-muted-foreground">
            Aún no hay niños. <Link className="text-violet-700 font-semibold" to="/parent/kids">Agrega uno</Link>.
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl bg-white border border-slate-100 shadow-sm p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-bold flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4" /> Pendientes de aprobación
          </h2>
          <Link to="/parent/approvals" className="text-sm font-semibold text-violet-700">
            Ver todas {data.pending ? `(${data.pending})` : ""}
          </Link>
        </div>
        <ul className="mt-3 divide-y divide-slate-100">
          {[...reviewSample.map((r) => ({ ...r, type: "review" })),
            ...claimsSample.map((c) => ({ ...c, type: "claim" })),
            ...redemptionsSample.map((r) => ({ ...r, type: "reward" }))].map((p) => (
            <li key={p.type + p.id} className="py-2.5 flex items-center gap-3">
              <span className="text-xl">{p.emoji}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">
                  {p.kid_name} — {p.title}
                  {p.type === "reward" ? ` (${fmtPoints(p.cost)} pts)` : ` (+${fmtPoints(p.points)})`}
                </p>
                <p className="text-xs text-muted-foreground">
                  {p.type === "review" ? "Vencida sin registrar — revisar" : p.type === "claim" ? "Quest completada" : "Recompensa canjeada"}
                </p>
              </div>
            </li>
          ))}
          {!reviewSample.length && !claimsSample.length && !redemptionsSample.length ? (
            <li className="py-4 text-sm text-muted-foreground text-center">Nada pendiente. ¡Todo al día!</li>
          ) : null}
        </ul>
      </section>

      <section className="rounded-2xl bg-white border border-slate-100 shadow-sm p-5">
        <h2 className="font-bold mb-1">Actividad reciente</h2>
        <HistoryList entries={data.activity} />
      </section>
    </div>
  );
}