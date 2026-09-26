import { useCallback, useEffect, useState } from "react";
import { CalendarX2, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { ErrorView, Loading } from "@/components/questly/ApiState";
import ConfirmDialog from "@/components/questly/ConfirmDialog";
import StateChip from "@/components/questly/StateChip";
import DayQuestList from "@/components/questly/DayQuestList";
import { api, fmtDateLabel, fmtPoints, notifyPointsChanged } from "@/lib/questlyApi";
import { repeatLabel } from "@/lib/questlyData";

// Vista de AYER y HOY por niño. Las instancias de ayer que quedaron sin hacer
// vencen solas (❌); el adulto decide si aplica la penalización del 50% — una
// sola vez por instancia (quest + niño + fecha).
export default function ParentToday() {
  const { toast } = useToast();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [target, setTarget] = useState(null); // { quest, kid, date? }
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await api("/parent/today"));
    } catch (e) {
      setError(e);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const confirmMissed = async () => {
    setBusy(true);
    try {
      const res = await api(`/parent/quests/${target.quest.id}/missed/${target.kid.id}`, {
        method: "POST",
        body: target.date ? { date: target.date } : {},
      });
      toast({ title: "Registrado", description: res.message });
      setData((d) => ({ ...d, rows: res.rows, yesterday_rows: res.yesterday_rows }));
      notifyPointsChanged();
      setTarget(null);
    } catch (e) {
      toast({ title: "Ups", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  if (error) return <ErrorView error={error} onRetry={load} />;
  if (!data) return <Loading label="Mirando las quests…" />;

  const todayLabel = fmtDateLabel(data.today_date);
  const yesterdayLabel = fmtDateLabel(data.yesterday_date);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">Ayer y hoy</h1>
        <p className="text-sm text-muted-foreground">Cierra el día: penaliza las que no se hicieron.</p>
      </div>

      <section>
        <div className="flex items-center gap-2 mb-3">
          <h2 className="font-bold text-lg flex items-center gap-2">
            <History className="h-5 w-5 text-slate-500" /> Ayer
          </h2>
          <span className="text-xs text-muted-foreground capitalize">{yesterdayLabel}</span>
        </div>
        <div className="space-y-3">
          {(data.yesterday_rows || []).map(({ kid, items }) => (
            <div key={kid.id} className="rounded-2xl bg-white border border-slate-100 shadow-sm p-5">
              <div className="flex items-center gap-3 mb-2">
                <span className="h-9 w-9 rounded-full grid place-items-center text-lg"
                  style={{ backgroundColor: (kid.color || "#7c4dff") + "2e" }}>
                  {kid.avatar}
                </span>
                <h3 className="font-bold">{kid.name}</h3>
                <span className="text-xs text-muted-foreground ml-auto">⭐ {fmtPoints(kid.points)} puntos</span>
              </div>
              <DayQuestList
                items={items}
                actions={(q) =>
                  q.state === "missed" && !q.penalty_applied ? (
                    <Button size="sm" variant="outline" disabled={busy}
                      className="text-rose-600 border-rose-200 hover:bg-rose-50 hover:text-rose-700"
                      onClick={() => setTarget({ quest: q, kid, date: data.yesterday_date })}>
                      <CalendarX2 className="h-4 w-4 mr-1" /> Penalizar -{fmtPoints(q.penalty)}
                    </Button>
                  ) : q.state === "missed" && q.penalty_applied ? (
                    <span className="text-xs font-semibold text-rose-500">-{fmtPoints(q.penalty)} aplicado</span>
                  ) : null
                }
              />
            </div>
          ))}
          {!data.yesterday_rows || !data.yesterday_rows.length ? (
            <div className="rounded-2xl bg-white border border-slate-100 shadow-sm p-6 text-center text-sm text-muted-foreground">
              Aún no hay niños en la familia.
            </div>
          ) : null}
        </div>
      </section>

      <section>
        <div className="flex items-center gap-2 mb-3">
          <h2 className="font-bold text-lg">Hoy</h2>
          <span className="text-xs text-muted-foreground capitalize">{todayLabel}</span>
        </div>
        <div className="space-y-3">
          {data.rows.map(({ kid, quests }) => (
            <div key={kid.id} className="rounded-2xl bg-white border border-slate-100 shadow-sm p-5">
              <div className="flex items-center gap-3 mb-3">
                <span className="h-10 w-10 rounded-full grid place-items-center text-xl"
                  style={{ backgroundColor: (kid.color || "#7c4dff") + "2e" }}>
                  {kid.avatar}
                </span>
                <div>
                  <h3 className="font-bold">{kid.name}</h3>
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
                        ⭐ {fmtPoints(q.points)} · {repeatLabel(q)}
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
                  <li className="py-3 text-sm text-muted-foreground">Sin quests para hoy.</li>
                ) : null}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <ConfirmDialog
        open={!!target}
        destructive
        title="¿Marcar como no realizada?"
        description={target
          ? `'${target.quest.title}' vale ⭐ ${fmtPoints(target.quest.points)} puntos. ` +
            `Se descontarán ${fmtPoints(target.quest.penalty)} puntos (50%) a ${target.kid.name}` +
            (target.date
              ? ` por la instancia del ${fmtDateLabel(target.date).toLowerCase()}.`
              : " y la quest quedará cerrada por hoy.") +
            " La penalización quedará en el historial."
          : ""}
        confirmLabel="Sí, aplicar penalización"
        loading={busy}
        onConfirm={confirmMissed}
        onCancel={() => setTarget(null)}
      />
    </div>
  );
}