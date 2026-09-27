import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/ui/use-toast";
import { ErrorView, Loading } from "@/components/questly/ApiState";
import ConfirmDialog from "@/components/questly/ConfirmDialog";
import GoalsList from "@/components/questly/GoalsList";
import KidStreaks from "@/components/questly/KidStreaks";
import RewardCard from "@/components/questly/RewardCard";
import { api, fmtMoney, fmtPoints, fmtWhen, notifyPointsChanged } from "@/lib/questlyApi";

// Panel de motivación del niño: saldo, metas, recompensas disponibles para él
// y sus rachas — todo viene del servidor, filtrado por el backend.
export default function KidShop() {
  const { toast } = useToast();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [buying, setBuying] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await api("/kid/shop"));
    } catch (e) {
      setError(e);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const confirmBuy = async () => {
    setBusy(true);
    try {
      const res = await api(`/kid/shop/${buying.id}/buy`, { method: "POST" });
      toast({ title: "🎉 " + res.message });
      setBuying(null);
      notifyPointsChanged();
      await load();
    } catch (e) {
      toast({ title: "Ups", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  // Poner o quitar una meta: el mismo endpoint alterna, sin duplicar.
  const toggleGoal = async (reward) => {
    setBusy(true);
    try {
      const res = await api(`/kid/goal/${reward.id}`, { method: "POST" });
      toast({ title: res.message });
      await load();
    } catch (e) {
      toast({ title: "Ups", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  if (error) return <ErrorView error={error} onRetry={load} />;
  if (!data) return <Loading label="Preparando tus recompensas…" />;

  const kidColor = data.kid.color || "#7c4dff";
  const goals = data.goals || [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold">Mis recompensas y metas 🎁</h1>

      {/* 1. Saldo actual */}
      <div className="rounded-3xl text-white p-5 shadow-md"
        style={{ background: `linear-gradient(120deg, ${kidColor} 0%, ${kidColor}cc 60%, #f59e0bcc 130%)` }}>
        <p className="text-sm opacity-90">Tienes</p>
        <div className="mt-1 flex items-end gap-2 flex-wrap">
          <span className="text-5xl font-black leading-none">⭐ {fmtPoints(data.kid.points)}</span>
          <span className="text-sm opacity-90 mb-1">puntos</span>
        </div>
        <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3.5 py-1 text-sm font-bold">
          💰 {fmtMoney(data.kid.points)}
        </p>
      </div>

      {/* 2. Metas */}
      <section>
        <h2 className="font-extrabold text-lg mb-3">🎯 Mis metas</h2>
        {goals.length ? (
          <GoalsList goals={goals} points={data.kid.points} onRemove={toggleGoal} />
        ) : (
          <p className="rounded-3xl bg-white border border-slate-100 shadow-sm p-5 text-sm text-muted-foreground">
            Todavía no tienes metas. Toca 🎯 en una recompensa para ponerte un objetivo y ver aquí cuánto te falta.
          </p>
        )}
      </section>

      {/* 3. Recompensas en espera */}
      {data.pending.length ? (
        <section className="rounded-3xl bg-amber-50 border border-amber-200 p-4">
          <h2 className="font-bold text-amber-800">Esperando que te la entreguen</h2>
          <ul className="mt-2 space-y-1.5">
            {data.pending.map((r) => (
              <li key={r.id} className="text-sm text-amber-900 font-medium">
                {r.emoji} {r.title} — pedida {fmtWhen(r.at)}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* 4. Recompensas disponibles para este niño */}
      <section>
        <h2 className="font-extrabold text-lg mb-3">🎁 Recompensas para ti</h2>
        {data.rewards.length ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {data.rewards.map((r) => (
              <RewardCard
                key={r.id}
                reward={r}
                points={data.kid.points}
                isGoal={goals.some((g) => g.id === r.id)}
                onBuy={setBuying}
                onSetGoal={toggleGoal}
                busy={busy}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-3xl bg-white border border-slate-100 shadow-sm p-10 text-center">
            <p className="font-bold">La tienda está vacía por ahora.</p>
            <p className="text-sm text-muted-foreground">Vuelve a mirar pronto.</p>
          </div>
        )}
      </section>

      {/* 5. Rachas */}
      <KidStreaks streaks={data.streaks || []} color={kidColor} />

      <ConfirmDialog
        open={!!buying}
        title={`¿Canjear ${buying?.emoji || ""} ${buying?.title || ""}?`}
        description={`Se descontarán ${buying?.cost} puntos y un adulto te la entregará.`}
        confirmLabel="¡Sí, la quiero!"
        loading={busy}
        onConfirm={confirmBuy}
        onCancel={() => setBuying(null)}
      />
    </div>
  );
}