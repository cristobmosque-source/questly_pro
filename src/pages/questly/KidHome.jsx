import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Gift, Star, Target } from "lucide-react";
import confetti from "canvas-confetti";
import { useToast } from "@/components/ui/use-toast";
import { ErrorView, Loading } from "@/components/questly/ApiState";
import QuestCard from "@/components/questly/QuestCard";
import { api, fmtPoints, kidGreeting, notifyPointsChanged } from "@/lib/questlyApi";

// Inicio del niño: saludo, puntos, meta de ahorro y sus quests de hoy.
export default function KidHome() {
  const { toast } = useToast();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await api("/kid/home"));
    } catch (e) {
      setError(e);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const claim = async (quest) => {
    setBusy(true);
    try {
      const res = await api(`/kid/quests/${quest.id}/claim`, { method: "POST" });
      setData((d) => ({ ...d, kid: res.kid, quests: res.quests }));
      confetti({ particleCount: 90, spread: 70, origin: { y: 0.7 }, colors: [kid.color || "#7c4dff", "#fbbf24", "#34d399"] });
      toast({ title: "🎉 " + res.message });
      notifyPointsChanged();
    } catch (e) {
      toast({ title: "Ups", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const toggleStep = async (quest, subtaskId) => {
    setBusy(true);
    try {
      await api(`/kid/quests/${quest.id}/step/${subtaskId}`, { method: "POST" });
      await load();
    } catch (e) {
      toast({ title: "Ups", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  if (error) return <ErrorView error={error} onRetry={load} />;
  if (!data) return <Loading label="Buscando tus quests…" />;

  const { kid, quests, goal, goal_chosen, goal_reached, affordable, history } = data;
  const kidColor = kid.color || "#7c4dff";
  const open = quests.filter((q) => q.state === "open");
  const waiting = quests.filter((q) => q.state === "pending");
  const done = quests.filter((q) => q.state === "done");
  const missed = quests.filter((q) => q.state === "missed");

  return (
    <div className="space-y-6">
      <div className="rounded-3xl text-white p-5 shadow-md"
        style={{ background: `linear-gradient(120deg, ${kidColor} 0%, ${kidColor}cc 55%, #f59e0bcc 130%)` }}>
        <p className="text-sm opacity-90">{kidGreeting()},</p>
        <h1 className="text-3xl font-extrabold">{kid.name} {kid.avatar}</h1>
        <div className="mt-3 flex items-end gap-2">
          <span className="text-5xl font-black leading-none">⭐ {fmtPoints(kid.points)}</span>
          <span className="text-sm opacity-90 mb-1">puntos</span>
        </div>
      </div>

      {goal && !goal_reached ? (
        <div className="rounded-3xl bg-amber-50 border border-amber-200 p-4">
          <p className="text-sm font-bold text-amber-800 flex items-center gap-1.5">
            <Target className="h-4 w-4" /> Tu meta
          </p>
          <p className="font-semibold text-amber-900 mt-1">
            {goal.emoji} {goal.title} — {fmtPoints(goal.cost)} puntos
          </p>
          <p className="text-xs text-amber-700">
            Te faltan {fmtPoints(goal.cost - kid.points)} puntos
            {!goal_chosen ? " (meta automática: la más cercana)" : ""}
          </p>
        </div>
      ) : null}

      {goal_reached ? (
        <div className="rounded-3xl bg-emerald-50 border border-emerald-200 p-4 text-center">
          <p className="font-bold text-emerald-800">🎉 ¡Ya puedes canjear {goal.emoji} {goal.title}!</p>
          <Link to="/kid/shop" className="text-sm font-semibold text-emerald-700 underline">Ir a la tienda</Link>
        </div>
      ) : null}

      {affordable.length && !goal_reached ? (
        <div className="rounded-3xl bg-white border border-slate-100 shadow-sm p-4">
          <p className="text-sm font-bold flex items-center gap-1.5">
            <Gift className="h-4 w-4" /> ¡Puedes canjear!
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {affordable.slice(0, 3).map((r) => (
              <span key={r.id} className="rounded-full bg-violet-50 border border-violet-100 px-3 py-1 text-sm font-semibold">
                {r.emoji} {r.title} ({r.cost})
              </span>
            ))}
            <Link to="/kid/shop" className="text-sm font-semibold text-violet-700 underline self-center">Ver tienda</Link>
          </div>
        </div>
      ) : null}

      {open.length ? (
        <section>
          <h2 className="font-extrabold text-lg mb-3">Para hoy</h2>
          <div className="space-y-4">
            {open.map((q) => (
              <QuestCard key={q.id} quest={q} onClaim={claim} onToggleStep={toggleStep} busy={busy} />
            ))}
          </div>
        </section>
      ) : null}

      {waiting.length ? (
        <section>
          <h2 className="font-extrabold text-lg mb-3">Esperando revisión ⏳</h2>
          <div className="space-y-4">
            {waiting.map((q) => (
              <QuestCard key={q.id} quest={q} onClaim={claim} onToggleStep={toggleStep} busy={busy} />
            ))}
          </div>
        </section>
      ) : null}

      {done.length ? (
        <section>
          <h2 className="font-extrabold text-lg mb-3">¡Hechas hoy! 🎉</h2>
          <div className="space-y-4">
            {done.map((q) => (
              <QuestCard key={q.id} quest={q} onClaim={claim} onToggleStep={toggleStep} busy={busy} />
            ))}
          </div>
        </section>
      ) : null}

      {missed.length ? (
        <section>
          <h2 className="font-extrabold text-lg mb-3">No realizadas</h2>
          <div className="space-y-4">
            {missed.map((q) => (
              <QuestCard key={q.id} quest={q} onClaim={claim} onToggleStep={toggleStep} busy={busy} />
            ))}
          </div>
        </section>
      ) : null}

      {!quests.length ? (
        <div className="rounded-3xl bg-white border border-slate-100 shadow-sm p-10 text-center">
          <Star className="mx-auto h-10 w-10 text-amber-400" />
          <p className="mt-2 font-bold">¡Nada pendiente por ahora!</p>
          <p className="text-sm text-muted-foreground">Cuando un adulto te asigne una quest, aparecerá aquí.</p>
        </div>
      ) : null}

      <section className="rounded-3xl bg-white border border-slate-100 shadow-sm p-5">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-bold">Últimos puntos</h2>
          <Link to="/kid/history" className="text-sm font-semibold text-violet-700">Ver todo</Link>
        </div>
        <ul className="divide-y divide-slate-100">
          {history.slice(0, 4).map((h) => (
            <li key={h.id} className="flex items-center gap-3 py-2.5">
              <span className={"font-mono text-sm font-bold w-12 text-right " + (h.delta > 0 ? "text-emerald-600" : "text-rose-600")}>
                {h.delta > 0 ? "+" : ""}{fmtPoints(h.delta)}
              </span>
              <span className="text-sm truncate flex-1">{h.reason}</span>
            </li>
          ))}
          {!history.length ? <li className="py-3 text-sm text-muted-foreground text-center">Todavía sin movimientos.</li> : null}
        </ul>
      </section>
    </div>
  );
}