import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Gift, Star, Target } from "lucide-react";
import confetti from "canvas-confetti";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { ErrorView, Loading } from "@/components/questly/ApiState";
import QuestCard from "@/components/questly/QuestCard";
import DayQuestList from "@/components/questly/DayQuestList";
import KidStreaks from "@/components/questly/KidStreaks";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { api, fmtDateLabel, fmtMoney, fmtPoints, kidGreeting, notifyApprovalsChanged, notifyPointsChanged } from "@/lib/questlyApi";

// Inicio del niño: saludo con puntos y su equivalente en pesos, resumen de
// AYER (hechas / no realizadas) y quests de HOY.
export default function KidHome() {
  const { toast } = useToast();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [celebrations, setCelebrations] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await api("/kid/home");
      setData(res);
      // rachas recién completadas: confeti + celebración
      if (res.celebrations && res.celebrations.length) {
        confetti({ particleCount: 160, spread: 100, origin: { y: 0.6 }, colors: ["#f97316", "#fbbf24", "#7c3aed"] });
        setCelebrations(res.celebrations);
      }
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
      confetti({ particleCount: 90, spread: 70, origin: { y: 0.7 }, colors: [data.kid.color || "#7c4dff", "#fbbf24", "#34d399"] });
      toast({ title: "🎉 " + res.message });
      notifyPointsChanged();
    } catch (e) {
      toast({ title: "Ups", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  // Retractación: solo mientras la quest está pendiente de revisión. Vuelve a
  // "por hacer" sin puntos, sin penalización y sin transacción.
  const retract = async (quest) => {
    setBusy(true);
    try {
      const res = await api(`/kid/quests/${quest.id}/retract`, { method: "POST" });
      setData((d) => ({ ...d, kid: res.kid, quests: res.quests }));
      toast({ title: "⏳ " + res.message });
      notifyApprovalsChanged();
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
  const yesterday = data.yesterday || { date: data.yesterday_date, items: [] };
  const kidColor = kid.color || "#7c4dff";
  const open = quests.filter((q) => q.state === "open" || q.state === "rejected");
  const waiting = quests.filter((q) => q.state === "pending");
  const done = quests.filter((q) => q.state === "done");
  const missed = quests.filter((q) => q.state === "missed");
  const naToday = quests.filter((q) => q.state === "not_applicable");

  const yDone = yesterday.items.filter((i) => i.state === "done");
  const yPending = yesterday.items.filter((i) => i.state === "pending");
  const yRejected = yesterday.items.filter((i) => i.state === "rejected");
  const yMissed = yesterday.items.filter((i) => i.state === "missed");
  const yNA = yesterday.items.filter((i) => i.state === "not_applicable");
  const yTotal = yesterday.items.length;

  const YesterdayGroup = ({ label, items, emoji }) => (
    <div>
      <p className="text-xs font-bold text-slate-500 mt-3 mb-1">{emoji} {label}</p>
      <DayQuestList items={items} />
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="rounded-3xl text-white p-5 shadow-md"
        style={{ background: `linear-gradient(120deg, ${kidColor} 0%, ${kidColor}cc 55%, #f59e0bcc 130%)` }}>
        <p className="text-sm opacity-90">{kidGreeting()},</p>
        <h1 className="text-3xl font-extrabold">{kid.name} {kid.avatar}</h1>
        <div className="mt-3 flex items-end gap-2 flex-wrap">
          <span className="text-5xl font-black leading-none">⭐ {fmtPoints(kid.points)}</span>
          <span className="text-sm opacity-90 mb-1">puntos</span>
        </div>
        <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3.5 py-1 text-sm font-bold">
          💰 {fmtMoney(kid.points)}
        </p>
      </div>

      {yTotal ? (
        <section className="rounded-3xl bg-white border border-slate-100 shadow-sm p-5">
          <div className="flex items-baseline gap-2 flex-wrap">
            <h2 className="font-extrabold text-lg">📅 Ayer</h2>
            <span className="text-xs text-muted-foreground capitalize">{fmtDateLabel(yesterday.date)}</span>
          </div>
          {yDone.length ? <YesterdayGroup label="Hechas" emoji="✅" items={yDone} /> : null}
          {yPending.length ? <YesterdayGroup label="Por revisar" emoji="⏳" items={yPending} /> : null}
          {yRejected.length ? <YesterdayGroup label="Rechazadas" emoji="🚫" items={yRejected} /> : null}
          {yNA.length ? <YesterdayGroup label="No aplica" emoji="➖" items={yNA} /> : null}
          {yMissed.length ? <YesterdayGroup label="No realizadas" emoji="❌" items={yMissed} /> : null}
        </section>
      ) : null}

      <KidStreaks streaks={data.streaks || []} color={kidColor} />

      <section>
        <div className="flex items-baseline gap-2 flex-wrap mb-3">
          <h2 className="font-extrabold text-lg">📅 Hoy</h2>
          <span className="text-xs text-muted-foreground capitalize">{fmtDateLabel(data.today_date)}</span>
        </div>

        {open.length ? (
          <p className="font-bold text-sm mb-3">🔥 Para hacer hoy</p>
        ) : null}
        <div className="space-y-4">
          {open.map((q) => (
            <QuestCard key={q.id} quest={q} onClaim={claim} onRetract={retract} onToggleStep={toggleStep} busy={busy} />
          ))}
        </div>

        {waiting.length ? (
          <p className="font-bold text-sm mt-5 mb-3">Esperando revisión ⏳</p>
        ) : null}
        <div className="space-y-4">
          {waiting.map((q) => (
            <QuestCard key={q.id} quest={q} onClaim={claim} onRetract={retract} onToggleStep={toggleStep} busy={busy} />
          ))}
        </div>

        {done.length ? (
          <p className="font-bold text-sm mt-5 mb-3">¡Hechas hoy! 🎉</p>
        ) : null}
        <div className="space-y-4">
          {done.map((q) => (
            <QuestCard key={q.id} quest={q} onClaim={claim} onRetract={retract} onToggleStep={toggleStep} busy={busy} />
          ))}
        </div>

        {missed.length ? (
          <p className="font-bold text-sm mt-5 mb-3">No realizadas</p>
        ) : null}
        <div className="space-y-4">
          {missed.map((q) => (
            <QuestCard key={q.id} quest={q} onClaim={claim} onRetract={retract} onToggleStep={toggleStep} busy={busy} />
          ))}
        </div>

        {naToday.length ? (
          <p className="font-bold text-sm mt-5 mb-3">No aplica hoy 🚫</p>
        ) : null}
        {naToday.length ? <DayQuestList items={naToday} /> : null}

        {!quests.length ? (
          <div className="rounded-3xl bg-white border border-slate-100 shadow-sm p-10 text-center">
            <Star className="mx-auto h-10 w-10 text-amber-400" />
            <p className="mt-2 font-bold">¡Nada pendiente por ahora!</p>
            <p className="text-sm text-muted-foreground">Cuando un adulto te asigne una quest, aparecerá aquí.</p>
          </div>
        ) : null}
      </section>

      {goal && !goal_reached ? (
        <div className="rounded-3xl bg-amber-50 border border-amber-200 p-4">
          <p className="text-sm font-bold text-amber-800 flex items-center gap-1.5">
            <Target className="h-4 w-4" /> Tu meta
          </p>
          <p className="font-semibold text-amber-900 mt-1">
            {goal.emoji} {goal.title} — ⭐ {fmtPoints(goal.cost)} puntos ({fmtMoney(goal.cost)})
          </p>
          <p className="text-xs text-amber-700">
            Te faltan ⭐ {fmtPoints(goal.cost - kid.points)} ({fmtMoney(goal.cost - kid.points)})
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
                {r.emoji} {r.title} (⭐ {fmtPoints(r.cost)})
              </span>
            ))}
            <Link to="/kid/shop" className="text-sm font-semibold text-violet-700 underline self-center">Ver tienda</Link>
          </div>
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
              <span className={"font-mono text-sm font-bold w-24 text-right " + (h.delta > 0 ? "text-emerald-600" : "text-rose-600")}>
                ⭐ {h.delta > 0 ? "+" : ""}{fmtPoints(h.delta)}
              </span>
              <span className="text-sm truncate flex-1">{h.reason}</span>
            </li>
          ))}
          {!history.length ? <li className="py-3 text-sm text-muted-foreground text-center">Todavía sin movimientos.</li> : null}
        </ul>
      </section>
      <Dialog open={!!celebrations} onOpenChange={(o) => { if (!o) setCelebrations(null); }}>
        <DialogContent className="text-center">
          <DialogTitle className="text-2xl font-extrabold">🔥 ¡Racha completada!</DialogTitle>
          <div className="mt-2 space-y-3">
            {(celebrations || []).map((c, i) => (
              <div key={i} className="rounded-2xl bg-orange-50 border border-orange-100 p-3">
                <p className="font-bold">{c.emoji} {c.name}</p>
                <p className="text-amber-600 font-extrabold">⭐ +{fmtPoints(c.reward_points)} puntos</p>
              </div>
            ))}
          </div>
          <Button className="mt-3 w-full font-bold" onClick={() => setCelebrations(null)}>
            ¡Genial!
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}