import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/ui/use-toast";
import { ErrorView, Loading } from "@/components/questly/ApiState";
import ConfirmDialog from "@/components/questly/ConfirmDialog";
import RewardCard from "@/components/questly/RewardCard";
import { api, notifyPointsChanged } from "@/lib/questlyApi";
import { fmtWhen } from "@/lib/questlyApi";

// Tienda del niño: recompensas, canje y solicitudes en espera.
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

  const setGoal = async (reward) => {
    setBusy(true);
    try {
      const goalId = data.goal_id;
      const res = await api(`/kid/goal/${goalId === reward.id ? "clear" : reward.id}`, { method: "POST" });
      toast({ title: res.message });
      await load();
    } catch (e) {
      toast({ title: "Ups", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  if (error) return <ErrorView error={error} onRetry={load} />;
  if (!data) return <Loading label="Abriendo la tienda…" />;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold">Tienda 🎁</h1>

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

      {data.rewards.length ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {data.rewards.map((r) => (
            <RewardCard
              key={r.id}
              reward={r}
              points={data.kid.points}
              isGoal={data.goal_id === r.id}
              onBuy={setBuying}
              onSetGoal={setGoal}
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