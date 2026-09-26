import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowDownCircle, ArrowUpCircle, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { ErrorView, Loading } from "@/components/questly/ApiState";
import HistoryList from "@/components/questly/HistoryList";
import { api, fmtPoints, fmtWhen, notifyPointsChanged } from "@/lib/questlyApi";

const QUICK = [10, 25, 50, 100];

// Detalle de un niño: puntos, dar/quitar y todo su historial.
export default function ParentKidDetail() {
  const { id } = useParams();
  const { toast } = useToast();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ amount: "", reason: "" });

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await api(`/parent/kids/${id}`));
    } catch (e) {
      setError(e);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const award = async (negate) => {
    const amount = Number(form.amount);
    if (!amount) {
      toast({ title: "Elige una cantidad primero.", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const res = await api("/parent/award", {
        method: "POST",
        body: { kid_id: id, amount, reason: form.reason, negate },
      });
      toast({ title: res.message });
      setForm({ amount: "", reason: "" });
      notifyPointsChanged();
      await load();
    } catch (e) {
      toast({ title: "Ups", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  if (error) return <ErrorView error={error} onRetry={load} />;
  if (!data) return <Loading label="Cargando…" />;

  const { kid, history, redemptions } = data;

  return (
    <div className="space-y-6">
      <Link to="/parent/kids" className="inline-flex items-center gap-1 text-sm font-semibold text-violet-700">
        <ChevronLeft className="h-4 w-4" /> Niños
      </Link>

      <div className="rounded-2xl bg-white border border-slate-100 shadow-sm p-5">
        <div className="flex items-center gap-4">
          <span className="h-16 w-16 rounded-full grid place-items-center text-3xl"
            style={{ backgroundColor: (kid.color || "#7c4dff") + "2e" }}>
            {kid.avatar}
          </span>
          <div>
            <h1 className="text-2xl font-extrabold">{kid.name}</h1>
            <p className="text-sm text-muted-foreground">
              ⭐ {fmtPoints(kid.points)} puntos · total ganado {fmtPoints(kid.lifetime_points)}
            </p>
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          <Input type="number" placeholder="Puntos" className="w-24"
            value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          <Input placeholder="Razón (opcional)" className="flex-1"
            value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
        </div>
        <div className="mt-2 flex gap-2 flex-wrap items-center">
          {QUICK.map((q) => (
            <button key={q} type="button" onClick={() => setForm({ ...form, amount: String(q) })}
              className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold hover:bg-slate-200">
              {q}
            </button>
          ))}
          <div className="ml-auto flex gap-2">
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" disabled={busy} onClick={() => award(false)}>
              <ArrowUpCircle className="h-4 w-4 mr-1" /> Dar
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => award(true)}>
              <ArrowDownCircle className="h-4 w-4 mr-1" /> Quitar
            </Button>
          </div>
        </div>
      </div>

      <section className="rounded-2xl bg-white border border-slate-100 shadow-sm p-5">
        <h2 className="font-bold mb-1">Historial de puntos</h2>
        <HistoryList entries={history} />
      </section>

      {redemptions.length ? (
        <section className="rounded-2xl bg-white border border-slate-100 shadow-sm p-5">
          <h2 className="font-bold mb-2">Recompensas pedidas</h2>
          <ul className="divide-y divide-slate-100">
            {redemptions.map((r) => (
              <li key={r.id} className="flex items-center gap-3 py-2.5">
                <span className="text-xl">{r.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{r.title} — {r.cost} pts</p>
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