import { useState } from "react";
import { CalendarX2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import ConfirmDialog from "@/components/questly/ConfirmDialog";
import { HowDoneDialog, NoAplicaDialog } from "@/components/questly/InstanceDialogs";
import { api, fmtDateLabel, fmtPoints, notifyPointsChanged } from "@/lib/questlyApi";

// Acciones del adulto sobre una instancia pasada sin registrar (⚠️ Sin
// registrar): marcar como hecha (✅/🟡), penalizar (❌ -50%) o no aplica (🚫).
export default function PastInstanceActions({ item, kid, date, onDone }) {
  const { toast } = useToast();
  const [mode, setMode] = useState(null); // "how" | "noaplica" | "penalize"
  const [busy, setBusy] = useState(false);

  const run = async (fn) => {
    setBusy(true);
    try {
      const res = await fn();
      toast({ title: "Registrado", description: res.message });
      setMode(null);
      notifyPointsChanged();
      await onDone();
    } catch (e) {
      toast({ title: "Ups", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const resolve = (result, comment) =>
    run(() => api(`/parent/quests/${item.id}/instances/${kid.id}/resolve`, {
      method: "POST",
      body: { date, result, comment },
    }));

  const label = `${item.emoji} ${item.title} — ${kid.name}`;

  return (
    <>
      <div className="flex gap-1.5 flex-wrap">
        <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 font-bold"
          onClick={() => setMode("how")}>
          ✅ Marcar como hecha
        </Button>
        <Button size="sm" variant="outline"
          className="text-slate-600 border-slate-300 hover:bg-slate-50 font-bold"
          onClick={() => setMode("noaplica")}>
          🚫 No aplica
        </Button>
        <Button size="sm" variant="outline" disabled={busy}
          className="text-rose-600 border-rose-200 hover:bg-rose-50 hover:text-rose-700"
          onClick={() => setMode("penalize")}>
          <CalendarX2 className="h-4 w-4 mr-1" /> Penalizar −{fmtPoints(item.penalty)}
        </Button>
      </div>

      <HowDoneDialog
        open={mode === "how"} title={label} points={item.points} busy={busy}
        onChoose={(r) => resolve(r)} onClose={() => setMode(null)} />
      <NoAplicaDialog
        open={mode === "noaplica"} title={label} busy={busy}
        onConfirm={(c) => resolve("not_applicable", c)} onClose={() => setMode(null)} />
      <ConfirmDialog
        open={mode === "penalize"}
        destructive
        title="¿Marcar como no realizada?"
        description={`Se descontarán ${fmtPoints(item.penalty)} puntos (50%) a ${kid.name} por la instancia del ${fmtDateLabel(date).toLowerCase()}.`}
        confirmLabel="Sí, aplicar penalización"
        loading={busy}
        onConfirm={() =>
          run(() => api(`/parent/quests/${item.id}/missed/${kid.id}`, {
            method: "POST",
            body: { date },
          }))}
        onCancel={() => setMode(null)}
      />
    </>
  );
}