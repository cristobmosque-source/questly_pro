import { useCallback, useEffect, useState } from "react";
import { CalendarX2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { ErrorView, Loading } from "@/components/questly/ApiState";
import ConfirmDialog from "@/components/questly/ConfirmDialog";
import StateChip from "@/components/questly/StateChip";
import { api, fmtPoints } from "@/lib/questlyApi";
import { repeatLabel } from "@/lib/questlyData";

// Quests de hoy por niño, con la acción "marcar como no realizada"
// (penalización del 50%, calculada y confirmada por el backend).
export default function ParentToday() {
  const { toast } = useToast();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [target, setTarget] = useState(null); // { quest, kid }
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await api("/parent/today");
      setRows(data.rows);
    } catch (e) {
      setError(e);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const confirmMissed = async () => {
    setBusy(true);
    try {
      const res = await api(`/parent/quests/${target.quest.id}/missed/${target.kid.id}`, { method: "POST" });
      toast({ title: "Registrado", description: res.message });
      setRows(res.rows);
      setTarget(null);
    } catch (e) {
      toast({ title: "Ups", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  if (error) return <ErrorView error={error} onRetry={load} />;
  if (!rows) return <Loading label="Mirando las quests de hoy…" />;

  const today = new Date().toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">Quests de hoy</h1>
        <p className="text-sm text-muted-foreground capitalize">{today}</p>
      </div>

      {rows.map(({ kid, quests }) => (
        <section key={kid.id} className="rounded-2xl bg-white border border-slate-100 shadow-sm p-5">
          <div className="flex items-center gap-3 mb-3">
            <span className="h-10 w-10 rounded-full grid place-items-center text-xl"
              style={{ backgroundColor: (kid.color || "#7c4dff") + "2e" }}>
              {kid.avatar}
            </span>
            <div>
              <h2 className="font-bold">{kid.name}</h2>
              <p className="text-xs text-muted-foreground">⭐ {fmtPoints(kid.points)} puntos</p>
            </div>
          </div>
          <ul className="divide-y divide-slate-100">
            {quests.map((q) => (
              <li key={q.id} className="py-3 flex items-center gap-3 flex-wrap">
                <span className="text-2xl">{q.emoji}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm">{q.title}</p>
                  <p className="text-xs text-muted-foreground">
                    ⭐ {q.points} · {repeatLabel(q)}
                  </p>
                </div>
                {q.state === "open" ? (
                  <Button size="sm" variant="outline"
                    className="text-rose-600 border-rose-200 hover:bg-rose-50 hover:text-rose-700"
                    onClick={() => setTarget({ quest: q, kid })}>
                    <CalendarX2 className="h-4 w-4 mr-1" /> No realizada
                  </Button>
                ) : (
                  <StateChip state={q.state} />
                )}
              </li>
            ))}
            {!quests.length ? (
              <li className="py-3 text-sm text-muted-foreground">Sin quests diarias para hoy.</li>
            ) : null}
          </ul>
        </section>
      ))}

      {!rows.length ? (
        <div className="rounded-2xl bg-white border border-slate-100 shadow-sm p-8 text-center text-sm text-muted-foreground">
          Aún no hay niños en la familia.
        </div>
      ) : null}

      <ConfirmDialog
        open={!!target}
        destructive
        title="¿Marcar esta tarea como no realizada?"
        description={target
          ? `Se descontarán ${fmtPoints(target.quest.penalty)} puntos a ${target.kid.name} ` +
            `( '${target.quest.title}' vale ${target.quest.points} puntos; penalización del 50%). ` +
            "La quest quedará cerrada por hoy y la penalización quedará en el historial."
          : ""}
        confirmLabel="Sí, marcar como no realizada"
        loading={busy}
        onConfirm={confirmMissed}
        onCancel={() => setTarget(null)}
      />
    </div>
  );
}