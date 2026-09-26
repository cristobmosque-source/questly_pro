import { useCallback, useEffect, useState } from "react";
import { History as HistoryIcon } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { ErrorView, Loading } from "@/components/questly/ApiState";
import HistoryList, { txnActorName, txnCategory } from "@/components/questly/HistoryList";
import ConfirmDialog from "@/components/questly/ConfirmDialog";
import { api, fmtSigned, fmtWhen, notifyPointsChanged } from "@/lib/questlyApi";
import { cn } from "@/lib/utils";

const CATEGORIES = [
  { id: "all", label: "Todos" },
  { id: "quest", label: "Tareas" },
  { id: "reward", label: "Recompensas" },
  { id: "adjust", label: "Ajustes" },
  { id: "streak", label: "Rachas" },
  { id: "reversal", label: "Reversiones" },
];

// Historial contable de toda la familia: quién recibió los puntos, quién
// ejecutó cada acción, qué ocurrió y cuándo — con filtros y "Deshacer" (que
// crea un movimiento inverso y conserva la trazabilidad completa).
export default function ParentHistory() {
  const { toast } = useToast();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [kidId, setKidId] = useState("all");
  const [category, setCategory] = useState("all");
  const [actor, setActor] = useState("all");
  const [reversing, setReversing] = useState(null); // movimiento a deshacer

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await api("/parent/history"));
    } catch (e) {
      setError(e);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ↩️ Deshacer: confirmación clara y luego transacción inversa (el original
  // nunca se borra del libro).
  const doReverse = async () => {
    setBusy(true);
    try {
      const res = await api(`/parent/txns/${reversing.id}/reverse`, { method: "POST" });
      setData((d) => ({ ...d, txns: res.txns }));
      setReversing(null);
      notifyPointsChanged();
      toast({ title: "↩️ Movimiento revertido", description: res.message });
    } catch (e) {
      toast({ title: "Ups", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  if (error) return <ErrorView error={error} onRetry={load} />;
  if (!data) return <Loading label="Buscando la actividad…" />;

  const entries = data.txns.filter((h) =>
    (kidId === "all" || h.kid_id === kidId) &&
    (category === "all" || txnCategory(h) === category) &&
    (actor === "all" || txnActorName(h) === actor));

  const actorOptions = [
    { id: "all", label: "Todos" },
    { id: data.parent_name, label: "👨 " + data.parent_name },
    ...data.kids.map((k) => ({ id: k.name, label: "🧒 " + k.name })),
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold flex items-center gap-2">
          <HistoryIcon className="h-6 w-6 text-violet-600" /> Historial
        </h1>
        <p className="text-sm text-muted-foreground">
          Libro de movimientos de la familia: quién recibió los puntos, quién ejecutó cada acción y la posibilidad de deshacer.
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setKidId("all")}
            className={cn("rounded-full px-4 py-1.5 text-sm font-semibold border transition-colors",
              kidId === "all" ? "bg-violet-600 border-violet-600 text-white" : "bg-white border-slate-200 text-slate-600")}>
            👨‍👩‍👧 Toda la familia
          </button>
          {data.kids.map((k) => (
            <button key={k.id} onClick={() => setKidId(k.id)}
              className={cn("rounded-full px-4 py-1.5 text-sm font-semibold border transition-colors",
                kidId === k.id ? "text-white" : "bg-white border-slate-200 text-slate-600")}
              style={kidId === k.id ? { backgroundColor: k.color, borderColor: k.color } : undefined}>
              {k.avatar} {k.name}
            </button>
          ))}
        </div>

        <div className="flex gap-2 flex-wrap items-center">
          {CATEGORIES.map((c) => (
            <button key={c.id} onClick={() => setCategory(c.id)}
              className={cn("rounded-full px-3.5 py-1 text-xs font-bold border transition-colors",
                category === c.id ? "bg-slate-800 border-slate-800 text-white" : "bg-white border-slate-200 text-slate-500")}>
              {c.label}
            </button>
          ))}
          <span className="text-xs font-semibold text-muted-foreground ml-2">Realizado por:</span>
          {actorOptions.map((a) => (
            <button key={a.id} onClick={() => setActor(a.id)}
              className={cn("rounded-full px-3.5 py-1 text-xs font-bold border transition-colors",
                actor === a.id ? "bg-amber-500 border-amber-500 text-white" : "bg-white border-slate-200 text-slate-500")}>
              {a.label}
            </button>
          ))}
        </div>
      </div>

      <section className="rounded-2xl bg-white border border-slate-100 shadow-sm p-5">
        <HistoryList entries={entries} canUndo onReverse={setReversing} busy={busy} />
        {!entries.length ? (
          <p className="text-sm text-muted-foreground text-center py-4">Sin movimientos con estos filtros.</p>
        ) : null}
      </section>

      <ConfirmDialog
        open={!!reversing}
        destructive
        title="¿Deshacer este movimiento?"
        description={reversing
          ? `Esto revertirá ${fmtSigned(reversing.delta)} puntos de ${reversing.kid_name}.\n\n` +
            `Movimiento original:\n${reversing.reason}\n⭐ ${fmtSigned(reversing.delta)}\n${fmtWhen(reversing.at)}` +
            (reversing.kind === "redeem" ? "\n\nEl canje quedará revertido y el stock de la recompensa será repuesto." : "")
          : ""}
        confirmLabel="Deshacer"
        loading={busy}
        onConfirm={doReverse}
        onCancel={() => setReversing(null)}
      />
    </div>
  );
}