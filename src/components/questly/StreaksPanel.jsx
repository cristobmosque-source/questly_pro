import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/use-toast";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ErrorView, Loading } from "@/components/questly/ApiState";
import ConfirmDialog from "@/components/questly/ConfirmDialog";
import StreakForm from "@/components/questly/StreakForm";
import { api, fmtPoints } from "@/lib/questlyApi";
import { cn } from "@/lib/utils";

const typeLabel = (s) => (s.type === "days" ? `${s.target} días consecutivos` : `${s.target} veces`);

// Administración de rachas: crear, editar, activar/pausar y eliminar.
export default function StreaksPanel() {
  const { toast } = useToast();
  const [streaks, setStreaks] = useState(null);
  const [meta, setMeta] = useState(null); // {quests, kids}
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(null); // streak | "new"
  const [deleting, setDeleting] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [s, q] = await Promise.all([api("/parent/streaks"), api("/parent/quests")]);
      setStreaks(s.streaks);
      setMeta({ quests: q.quests, kids: q.kids });
    } catch (e) {
      setError(e);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const submit = async (payload) => {
    setBusy(true);
    try {
      const res = editing === "new"
        ? await api("/parent/streaks", { method: "POST", body: payload })
        : await api(`/parent/streaks/${editing.id}`, { method: "POST", body: payload });
      setStreaks(res.streaks);
      toast({ title: res.message });
      setEditing(null);
    } catch (e) {
      toast({ title: "Ups", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (s) => {
    try {
      const res = await api(`/parent/streaks/${s.id}`, { method: "POST", body: { action: "toggle" } });
      setStreaks(res.streaks);
    } catch (e) {
      toast({ title: "Ups", description: e.message, variant: "destructive" });
    }
  };

  const confirmDelete = async () => {
    setBusy(true);
    try {
      const res = await api(`/parent/streaks/${deleting.id}`, { method: "POST", body: { action: "delete" } });
      setStreaks(res.streaks);
      toast({ title: res.message });
      setDeleting(null);
    } catch (e) {
      toast({ title: "Ups", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  if (error) return <ErrorView error={error} onRetry={load} />;
  if (!streaks || !meta) return <Loading label="Cargando rachas…" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="font-extrabold text-lg">🔥 Rachas</h2>
          <p className="text-xs text-muted-foreground">
            Objetivos ligados a una quest. Solo cuenta la tarea aprobada al 100%; una no realizada rompe las rachas de días.
          </p>
        </div>
        <Button onClick={() => setEditing("new")} className="font-bold">
          <Plus className="h-4 w-4 mr-1" /> Nueva racha
        </Button>
      </div>

      <ul className="space-y-3">
        {streaks.map((s) => (
          <li key={s.id} className={cn("rounded-2xl bg-white border border-slate-100 shadow-sm p-4", s.active ? "" : "opacity-60")}>
            <div className="flex items-start gap-3 flex-wrap">
              <span className="h-11 w-11 rounded-xl bg-orange-50 grid place-items-center text-2xl">
                {s.type === "days" ? "🔥" : "⭐"}
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-bold">
                  {s.name}
                  {!s.quest_active ? <span className="text-xs text-amber-600 font-semibold"> · quest pausada</span> : null}
                </p>
                <p className="text-xs text-muted-foreground">
                  {s.quest_emoji} {s.quest_title} · {typeLabel(s)} ·{" "}
                  {s.kid_name || "Todos los niños"} ·{" "}
                  <span className="text-amber-600 font-bold">⭐ +{fmtPoints(s.reward_points)}</span>
                  {" · "}{s.repeatable ? "repetible" : "no repetible"}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {s.progress.filter((p) => !s.kid_id || p.kid_id === s.kid_id).map((p) => (
                    <span key={p.kid_id} className={cn("rounded-full px-2.5 py-0.5 text-xs font-bold",
                      p.completed ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600")}>
                      {p.kid_name} {p.completed ? "✅ completada" : `${p.count}/${s.target}`}
                      {p.rounds > 0 ? ` · ${p.rounds} ronda${p.rounds > 1 ? "s" : ""}` : ""}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={s.active} onCheckedChange={() => toggle(s)} />
                <Button size="icon" variant="ghost" onClick={() => setEditing(s)} title="Editar">
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" className="text-rose-500" onClick={() => setDeleting(s)} title="Eliminar">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </li>
        ))}
        {!streaks.length ? (
          <li className="rounded-2xl bg-white border border-slate-100 shadow-sm p-8 text-center text-sm text-muted-foreground">
            Aún no hay rachas. Crea la primera: por ejemplo, "Hacer la cama 7 días seguidos".
          </li>
        ) : null}
      </ul>

      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing === "new" ? "Nueva racha" : "Editar racha"}</DialogTitle>
            <DialogDescription>
              Al completar el objetivo se entregan los puntos automáticamente y el niño ve una celebración.
            </DialogDescription>
          </DialogHeader>
          {editing ? (
            <StreakForm
              key={editing === "new" ? "new" : editing.id}
              initial={editing === "new" ? null : editing}
              quests={meta.quests}
              kids={meta.kids}
              onSubmit={submit}
              submitting={busy}
              submitLabel={editing === "new" ? "Crear racha" : "Guardar cambios"}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleting}
        destructive
        title={`¿Eliminar '${deleting?.name || ""}'?`}
        description="Se borrará también el progreso de esta racha."
        confirmLabel="Eliminar"
        loading={busy}
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}