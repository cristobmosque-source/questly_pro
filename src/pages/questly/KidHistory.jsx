import { useCallback, useEffect, useState } from "react";
import { ErrorView, Loading } from "@/components/questly/ApiState";
import HistoryList from "@/components/questly/HistoryList";
import { api, fmtPoints, fmtWhen } from "@/lib/questlyApi";

// Historial del niño: puntos ganados, gastados y penalizaciones.
export default function KidHistory() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await api("/kid/history"));
    } catch (e) {
      setError(e);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (error) return <ErrorView error={error} onRetry={load} />;
  if (!data) return <Loading label="Buscando tu historial…" />;

  const earned = data.history.filter((h) => h.delta > 0).reduce((s, h) => s + Number(h.delta), 0);
  const spent = data.history.filter((h) => h.delta < 0).reduce((s, h) => s - Number(h.delta), 0);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold">Mi historial</h1>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl bg-white border border-slate-100 shadow-sm p-4 text-center">
          <p className="text-xs font-semibold text-muted-foreground">Tengo</p>
          <p className="text-2xl font-extrabold text-amber-600">⭐ {fmtPoints(data.kid.points)}</p>
        </div>
        <div className="rounded-2xl bg-white border border-slate-100 shadow-sm p-4 text-center">
          <p className="text-xs font-semibold text-muted-foreground">Ganados</p>
          <p className="text-2xl font-extrabold text-emerald-600">+{fmtPoints(earned)}</p>
        </div>
        <div className="rounded-2xl bg-white border border-slate-100 shadow-sm p-4 text-center">
          <p className="text-xs font-semibold text-muted-foreground">Gastados</p>
          <p className="text-2xl font-extrabold text-rose-500">-{fmtPoints(spent)}</p>
        </div>
      </div>

      <section className="rounded-3xl bg-white border border-slate-100 shadow-sm p-5">
        <h2 className="font-bold mb-1">Movimientos</h2>
        <HistoryList entries={data.history} />
      </section>

      {data.redemptions.length ? (
        <section className="rounded-3xl bg-white border border-slate-100 shadow-sm p-5">
          <h2 className="font-bold mb-2">Recompensas pedidas</h2>
          <ul className="divide-y divide-slate-100">
            {data.redemptions.map((r) => (
              <li key={r.id} className="flex items-center gap-3 py-2.5">
                <span className="text-xl">{r.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{r.title}</p>
                  <p className="text-xs text-muted-foreground">{fmtWhen(r.at)}</p>
                </div>
                <span className={
                  "text-xs font-bold rounded-full px-2.5 py-1 " +
                  (r.status === "pending" ? "bg-amber-100 text-amber-700"
                    : r.status === "approved" ? "bg-emerald-100 text-emerald-700"
                    : "bg-slate-100 text-slate-500")
                }>
                  {r.status === "pending" ? "Por entregar" : r.status === "approved" ? "Entregada" : "Rechazada"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}