import { useCallback, useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { ErrorView, Loading } from "@/components/questly/ApiState";
import { api, fmtWhen, notifyApprovalsChanged, notifyPointsChanged } from "@/lib/questlyApi";

// Aprobaciones: quests completadas y recompensas canjeadas, una decisión
// cada vez — la lógica (puntos, reembolsos, stock) vive en el backend.
export default function ParentApprovals() {
  const { toast } = useToast();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await api("/parent/approvals"));
    } catch (e) {
      setError(e);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const decide = async (kind, item, decision) => {
    setBusyId(kind + item.id);
    try {
      const path = kind === "claim" ? "/parent/claims/" : "/parent/redemptions/";
      const res = await api(path + item.id, { method: "POST", body: { decision } });
      toast({ title: res.message });
      setData({ claims: res.claims, redemptions: res.redemptions });
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

  const DecisionButtons = ({ kind, item }) => (
    <div className="flex gap-2">
      <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 font-bold"
        disabled={busyId === kind + item.id}
        onClick={() => decide(kind, item, "approve")}>
        <Check className="h-4 w-4 mr-1" /> Aprobar
      </Button>
      <Button size="sm" variant="outline" disabled={busyId === kind + item.id}
        onClick={() => decide(kind, item, "reject")}>
        <X className="h-4 w-4 mr-1" /> Rechazar
      </Button>
    </div>
  );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold">Aprobaciones</h1>

      <section>
        <h2 className="font-bold mb-3">Quests completadas ({data.claims.length})</h2>
        {data.claims.length ? (
          <ul className="space-y-3">
            {data.claims.map((c) => (
              <li key={c.id} className="rounded-2xl bg-white border border-slate-100 shadow-sm p-4 flex items-center gap-3 flex-wrap">
                <span className="text-2xl">{c.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">
                    {c.kid_name}: {c.title} <span className="text-emerald-600 font-bold">+{c.points}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">{fmtWhen(c.at)}</p>
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
        <h2 className="font-bold mb-3">Recompensas canjeadas ({data.redemptions.length})</h2>
        {data.redemptions.length ? (
          <ul className="space-y-3">
            {data.redemptions.map((r) => (
              <li key={r.id} className="rounded-2xl bg-white border border-slate-100 shadow-sm p-4 flex items-center gap-3 flex-wrap">
                <span className="text-2xl">{r.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">
                    {r.kid_name}: {r.title} <span className="text-rose-500 font-bold">-{r.cost} pts</span>
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
    </div>
  );
}