import { useCallback, useEffect, useState } from "react";
import { History as HistoryIcon } from "lucide-react";
import { ErrorView, Loading } from "@/components/questly/ApiState";
import HistoryList from "@/components/questly/HistoryList";
import { api } from "@/lib/questlyApi";
import { cn } from "@/lib/utils";

// Historial de toda la familia: puntos ganados, gastados y penalizaciones,
// con filtro por niño.
export default function ParentHistory() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [kidId, setKidId] = useState("all");

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await api("/parent/dashboard"));
    } catch (e) {
      setError(e);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (error) return <ErrorView error={error} onRetry={load} />;
  if (!data) return <Loading label="Buscando la actividad…" />;

  const entries = kidId === "all"
    ? data.activity
    : data.activity.filter((h) => h.kid_id === kidId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold flex items-center gap-2">
          <HistoryIcon className="h-6 w-6 text-violet-600" /> Historial
        </h1>
        <p className="text-sm text-muted-foreground">Todos los movimientos de puntos de la familia.</p>
      </div>

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

      <section className="rounded-2xl bg-white border border-slate-100 shadow-sm p-5">
        <HistoryList entries={entries} />
        {!entries.length ? (
          <p className="text-sm text-muted-foreground text-center py-4">Sin movimientos todavía.</p>
        ) : null}
      </section>
    </div>
  );
}