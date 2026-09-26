import { useCallback, useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { ErrorView, Loading } from "@/components/questly/ApiState";
import { NoAplicaDialog } from "@/components/questly/InstanceDialogs";
import ReviewDialog from "@/components/questly/ReviewDialog";
import { api, fmtDateLabel, fmtMoney, fmtPoints, fmtWhen, notifyApprovalsChanged, notifyPointsChanged } from "@/lib/questlyApi";

// Aprobaciones: quests marcadas por los niños, instancias vencidas sin
// registrar (pendientes de revisión) y recompensas canjeadas — una decisión a
// la vez; la lógica (puntos, reembolsos, stock) vive en el backend.
export default function ParentApprovals() {
  const { toast } = useToast();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [naTarget, setNaTarget] = useState(null);
  const [reviewTarget, setReviewTarget] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await api("/parent/approvals"));
    } catch (e) {
      setError(e);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // 🚫 No aplica: 0 puntos, sin transacción y sin afectar rachas, con
  // comentario opcional que queda en la instancia.
  const decideNoAplica = async (comment) => {
    const c = naTarget;
    setBusyId("claim" + c.id);
    try {
      const res = await api("/parent/claims/" + c.id, {
        method: "POST",
        body: { decision: "not_applicable", comment },
      });
      toast({ title: res.message });
      setData({ claims: res.claims, redemptions: res.redemptions, reviews: data.reviews });
      setNaTarget(null);
      notifyApprovalsChanged();
      notifyPointsChanged();
    } catch (e) {
      toast({ title: "Ups", description: e.message, variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const decide = async (kind, item, decision) => {
    setBusyId(kind + item.id);
    try {
      const path = kind === "claim" ? "/parent/claims/" : "/parent/redemptions/";
      const res = await api(path + item.id, { method: "POST", body: { decision } });
      toast({ title: res.message });
      setData({ claims: res.claims, redemptions: res.redemptions, reviews: data.reviews });
      notifyApprovalsChanged();
      notifyPointsChanged();
    } catch (e) {
      toast({ title: "Ups", description: e.message, variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  // ⚠️ Instancia vencida sin registro ("Pendiente de revisión"): el adulto
  // decide qué pasó — ✅ 100% · 🟡 25% · ❌ −50% · 🚫 0 puntos.
  const resolveReview = async (result, comment) => {
    const t = reviewTarget;
    setBusyId("review" + t.id);
    try {
      const res = await api(`/parent/quests/${t.quest_id}/instances/${t.kid_id}/resolve`, {
        method: "POST",
        body: { date: t.date, period: t.period, result, comment },
      });
      toast({ title: res.message });
      setReviewTarget(null);
      await load();
      notifyApprovalsChanged();
      notifyPointsChanged();
    } catch (e) {
      toast({ title: "Ups", description: e.message, variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  if (error) return <ErrorView error={error} onRetry={load} />;
  if (!data) return <Loading label="Revisando pendientes…" />;

  // Pagos exactos por veredicto: 100% hecha · 25% a medias · -50% no realizada.
  const quarter = (p) => Math.round(p * 0.25 * 10) / 10;
  const half = (p) => Math.round(p / 2 * 10) / 10;
  const reviews = data.reviews || [];

  const DecisionButtons = ({ kind, item }) => (
    kind === "claim" ? (
      <div className="flex gap-2 flex-wrap">
        <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 font-bold"
          disabled={busyId === kind + item.id}
          onClick={() => decide(kind, item, "approve")}>
          <Check className="h-4 w-4 mr-1" /> Hecha +{fmtPoints(item.points)}
        </Button>
        <Button size="sm" className="bg-amber-500 hover:bg-amber-600 text-white font-bold"
          disabled={busyId === kind + item.id}
          onClick={() => decide(kind, item, "partial")}>
          🟡 A medias +{fmtPoints(quarter(item.points))}
        </Button>
        <Button size="sm" variant="outline"
          className="text-rose-600 border-rose-200 hover:bg-rose-50 font-bold"
          disabled={busyId === kind + item.id}
          onClick={() => decide(kind, item, "not_done")}>
          <X className="h-4 w-4 mr-1" /> No la hizo −{fmtPoints(half(item.points))}
        </Button>
        <Button size="sm" variant="outline" disabled={busyId === kind + item.id}
          className="text-slate-600 border-slate-300 hover:bg-slate-50 font-bold"
          onClick={() => setNaTarget(item)}>
          🚫 No aplica
        </Button>
      </div>
    ) : (
      <div className="flex gap-2">
        <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 font-bold"
          disabled={busyId === kind + item.id}
          onClick={() => decide(kind, item, "approve")}>
          <Check className="h-4 w-4 mr-1" /> Entregar
        </Button>
        <Button size="sm" variant="outline" disabled={busyId === kind + item.id}
          onClick={() => decide(kind, item, "reject")}>
          <X className="h-4 w-4 mr-1" /> Rechazar
        </Button>
      </div>
    )
  );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold">Aprobaciones</h1>

      <section>
        <h2 className="font-bold mb-3">Pendientes de aprobación ({data.claims.length})</h2>
        <p className="text-xs text-muted-foreground -mt-2 mb-3">
          ✅ Hecha 100% · 🟡 A medias 25% · ❌ No realizada −50% · 🚫 No aplica 0 (sin puntos, no rompe rachas)
        </p>
        {data.claims.length ? (
          <ul className="space-y-3">
            {data.claims.map((c) => (
              <li key={c.id} className="rounded-2xl bg-white border border-slate-100 shadow-sm p-4 flex items-center gap-3 flex-wrap">
                <span className="text-2xl">{c.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">
                    {c.kid_name}: {c.title} <span className="text-amber-600 font-bold">⭐ {fmtPoints(c.points)} · 💰 {fmtMoney(c.points)}</span>
                  </p>
                  <p className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                    <span className="rounded-full bg-amber-100 text-amber-800 text-[11px] font-bold px-2 py-0.5">
                      Marcada por {c.kid_name}
                    </span>
                    {c.date ? fmtDateLabel(c.date) : null} {c.date && c.at ? "· " : ""}{fmtWhen(c.at)}
                  </p>
                </div>
                <DecisionButtons kind="claim" item={c} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-2xl bg-white border border-slate-100 shadow-sm p-5 text-sm text-muted-foreground">
            Ninguna quest esperando revisión.
          </p>
        )}
      </section>

      <section>
        <h2 className="font-bold mb-3">Pendientes de revisión — no registradas ({reviews.length})</h2>
        <p className="text-xs text-muted-foreground -mt-2 mb-3">
          Vencieron sin que nadie las registrara: el sistema no asume nada. Decide qué pasó —
          ✅ 100% · 🟡 25% · ❌ −50% · 🚫 0.
        </p>
        {reviews.length ? (
          <ul className="space-y-3">
            {reviews.map((r) => (
              <li key={r.id} className="rounded-2xl bg-white border border-amber-200 shadow-sm p-4 flex items-center gap-3 flex-wrap">
                <span className="text-2xl">{r.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">
                    {r.kid_name}: {r.title} <span className="text-amber-600 font-bold">⭐ {fmtPoints(r.points)}</span>
                  </p>
                  <p className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                    <span className="rounded-full bg-slate-100 text-slate-500 text-[11px] font-bold px-2 py-0.5">
                      No registrada
                    </span>
                    {r.date ? fmtDateLabel(r.date) : r.label}
                  </p>
                </div>
                <Button size="sm" className="bg-violet-600 hover:bg-violet-700 font-bold"
                  onClick={() => setReviewTarget(r)}>
                  Revisar
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-2xl bg-white border border-slate-100 shadow-sm p-5 text-sm text-muted-foreground">
            Ninguna tarea vencida esperando revisión.
          </p>
        )}
      </section>

      <section>
        <h2 className="font-bold mb-3">Recompensas canjeadas ({data.redemptions.length})</h2>
        {data.redemptions.length ? (
          <ul className="space-y-3">
            {data.redemptions.map((r) => (
              <li key={r.id} className="rounded-2xl bg-white border border-slate-100 shadow-sm p-4 flex items-center gap-3 flex-wrap">
                <span className="text-2xl">{r.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">
                    {r.kid_name}: {r.title} <span className="text-rose-500 font-bold">⭐ -{fmtPoints(r.cost)}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {fmtWhen(r.at)} — aprueba para marcarla como entregada; rechazar devuelve los puntos.
                  </p>
                </div>
                <DecisionButtons kind="reward" item={r} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-2xl bg-white border border-slate-100 shadow-sm p-5 text-sm text-muted-foreground">
            Nadie ha canjeado recompensas todavía.
          </p>
        )}
      </section>

      <NoAplicaDialog
        open={!!naTarget}
        title={naTarget ? `${naTarget.emoji} ${naTarget.title} — ${naTarget.kid_name}` : ""}
        busy={!!naTarget && busyId === "claim" + naTarget.id}
        onConfirm={decideNoAplica}
        onClose={() => setNaTarget(null)}
      />

      <ReviewDialog
        open={!!reviewTarget}
        target={reviewTarget}
        busy={!!reviewTarget && busyId === "review" + reviewTarget.id}
        onResolve={resolveReview}
        onClose={() => setReviewTarget(null)}
      />
    </div>
  );
}