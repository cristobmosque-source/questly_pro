import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

// ♻️ Reasignar una quest "una sola vez": crea una NUEVA ASIGNACIÓN que apunta
// a la MISMA quest (mismo ID). La definición no se duplica; el catálogo y el
// historial de asignaciones anteriores se conservan intactos.
export default function ReassignDialog({ open, quest, kids, busy, onConfirm, onClose }) {
  const [kidId, setKidId] = useState(null);
  const [dueDate, setDueDate] = useState("");

  useEffect(() => {
    if (!open) {
      setKidId(null);
      setDueDate(quest ? quest.due_date || "" : "");
    }
  }, [open, quest]);

  if (!quest) return null;
  const chosen = kids.find((k) => k.id === kidId);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-lg font-extrabold">♻️ Asignar tarea</DialogTitle>
          <DialogDescription>
            Se crea una nueva asignación de la misma quest — la definición no se duplica y el
            historial anterior se conserva completo. Se puede asignar todas las veces que necesites.
          </DialogDescription>
        </DialogHeader>

        <div className="text-sm space-y-1">
          <p>
            <span className="text-muted-foreground">Tarea:</span>{" "}
            <span className="font-semibold">{quest.emoji} {quest.title}</span>
          </p>
          <p>
            <span className="text-muted-foreground">Puntos:</span>{" "}
            <span className="font-semibold text-amber-600">⭐ {quest.points}</span>
          </p>
        </div>

        <div>
          <p className="text-sm font-semibold mb-2">Asignar a:</p>
          <div className="flex flex-wrap gap-2">
            {kids.map((k) => (
              <button
                key={k.id}
                type="button"
                onClick={() => setKidId(k.id)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm font-semibold flex items-center gap-1.5 transition-colors",
                  kidId === k.id
                    ? "bg-violet-100 border-violet-400 text-violet-700"
                    : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                )}
              >
                <span>{k.avatar}</span> {k.name}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="re-due">Fecha (opcional)</Label>
          <Input id="re-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>

        {chosen ? (
          <p className="rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-800 text-sm font-semibold p-3">
            Se asignará '{quest.title}' a {chosen.name}{dueDate ? " para el " + dueDate.split("-").reverse().join("/") : ""}.
          </p>
        ) : null}

        <div className="flex gap-2 justify-end">
          <Button variant="outline" disabled={busy} onClick={onClose}>Cancelar</Button>
          <Button className="font-bold" disabled={!chosen || busy}
            onClick={() => chosen && onConfirm(chosen.id, dueDate || null)}>
            Asignar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}