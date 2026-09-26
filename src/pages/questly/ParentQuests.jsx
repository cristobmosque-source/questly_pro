import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus, Repeat, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/use-toast";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ErrorView, Loading } from "@/components/questly/ApiState";
import ConfirmDialog from "@/components/questly/ConfirmDialog";
import QuestForm from "@/components/questly/QuestForm";
import ReassignDialog from "@/components/questly/ReassignDialog";
import { api } from "@/lib/questlyApi";
import { daysSummary, repeatLabel } from "@/lib/questlyData";

// Tablero de quests del adulto: crear, editar, pausar y eliminar, con
// recurrencia daily / weekly / once / custom_days.
export default function ParentQuests() {
  const { toast } = useToast();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(null); // quest | "new"
  const [deleting, setDeleting] = useState(null);
  const [reassigning, setReassigning] = useState(null); // quest "una sola vez" a asignar

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await api("/parent/quests"));
    } catch (e) {
      setError(e);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const kidNames = (quest) => {
    if (!quest.assigned_to.length) return "Todos los niños";
    return data.kids
      .filter((k) => quest.assigned_to.includes(k.id))
      .map((k) => k.name).join(", ") || "—";
  };

  const createOrUpdate = async (payload) => {
    setBusy(true);
    try {
      if (editing === "new") {
        const res = await api("/parent/quests", { method: "POST", body: payload });
        setData((d) => ({ ...d, quests: res.quests }));
        toast({ title: res.message });
      } else {
        const res = await api(`/parent/quests/${editing.id}`, { method: "POST", body: payload });
        setData((d) => ({ ...d, quests: res.quests }));
        toast({ title: res.message });
      }
      setEditing(null);
    } catch (e) {
      toast({ title: "Ups", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (quest) => {
    try {
      const res = await api(`/parent/quests/${quest.id}`, {
        method: "POST", body: { action: "toggle" },
      });
      setData((d) => ({ ...d, quests: res.quests }));
    } catch (e) {
      toast({ title: "Ups", description: e.message, variant: "destructive" });
    }
  };

  const confirmDelete = async () => {
    setBusy(true);
    try {
      const res = await api(`/parent/quests/${deleting.id}`, {
        method: "POST", body: { action: "delete" },
      });
      setData((d) => ({ ...d, quests: res.quests }));
      toast({ title: res.message });
      setDeleting(null);
    } catch (e) {
      toast({ title: "Ups", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  // ♻️ Reasignar una quest "una sola vez": crea una nueva ASIGNACIÓN de la
  // misma quest (sin duplicar la definición); el historial queda intacto.
  const confirmReassign = async (kidId, dueDate) => {
    setBusy(true);
    try {
      const res = await api(`/parent/quests/${reassigning.id}/reassign`, {
        method: "POST", body: { kid_id: kidId, due_date: dueDate },
      });
      toast({ title: "Nueva asignación", description: res.message });
      setReassigning(null);
    } catch (e) {
      toast({ title: "Ups", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  if (error) return <ErrorView error={error} onRetry={load} />;
  if (!data) return <Loading label="Cargando quests…" />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">Quests</h1>
        <Button onClick={() => setEditing("new")} className="font-bold">
          <Plus className="h-4 w-4 mr-1" /> Nueva quest
        </Button>
      </div>

      <ul className="space-y-3">
        {data.quests.map((q) => (
          <li key={q.id} className={"rounded-2xl bg-white border border-slate-100 shadow-sm p-4 " + (q.active ? "" : "opacity-60")}>
            <div className="flex items-start gap-3 flex-wrap">
              <span className="h-11 w-11 rounded-xl bg-violet-50 grid place-items-center text-2xl">{q.emoji}</span>
              <div className="flex-1 min-w-0">
                <p className="font-bold">
                  {q.title} <span className="text-amber-600 font-extrabold text-sm">⭐ {q.points}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {repeatLabel(q)} · {q.repeat === "once" && q.due_date ? `Fecha: ${q.due_date} · ` : ""}
                  {q.times_per_period > 1 ? `${q.times_per_period} veces/período · ` : ""}
                  {q.subtasks.length ? `${q.subtasks.length} subtareas · ` : ""}
                  {kidNames(q)}
                </p>
                {q.repeat === "custom_days" ? (
                  <p className="text-xs text-violet-600 font-semibold mt-0.5">Días: {daysSummary(q.repeat_days)}</p>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={q.active} onCheckedChange={() => toggle(q)} />
                {q.repeat === "once" ? (
                  <Button size="icon" variant="ghost" title="Asignar a un niño" onClick={() => setReassigning(q)}>
                    <Repeat className="h-4 w-4" />
                  </Button>
                ) : null}
                <Button size="icon" variant="ghost" onClick={() => setEditing(q)} title="Editar">
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" className="text-rose-500" onClick={() => setDeleting(q)} title="Eliminar">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </li>
        ))}
        {!data.quests.length ? (
          <li className="rounded-2xl bg-white border border-slate-100 shadow-sm p-8 text-center text-sm text-muted-foreground">
            Aún no hay quests. Crea la primera con el botón de arriba.
          </li>
        ) : null}
      </ul>

      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing === "new" ? "Nueva quest" : "Editar quest"}</DialogTitle>
            <DialogDescription>
              Las reglas (recurrencia, límites, asignación) se validan y guardan en el servidor.
            </DialogDescription>
          </DialogHeader>
          {editing ? (
            <QuestForm
              key={editing === "new" ? "new" : editing.id}
              initial={editing === "new" ? null : editing}
              kids={data.kids}
              onSubmit={createOrUpdate}
              submitting={busy}
              submitLabel={editing === "new" ? "Crear quest" : "Guardar cambios"}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <ReassignDialog
        open={!!reassigning}
        quest={reassigning}
        kids={data.kids}
        busy={busy}
        onConfirm={confirmReassign}
        onClose={() => setReassigning(null)}
      />

      <ConfirmDialog
        open={!!deleting}
        destructive
        title={`¿Eliminar '${deleting?.title || ""}'?`}
        description="También se quitarán sus aprobaciones pendientes. Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        loading={busy}
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}