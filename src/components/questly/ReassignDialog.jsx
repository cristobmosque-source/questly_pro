import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

// ♻️ Reasignar una quest "una sola vez" ya completada: se crea una NUEVA
// instancia para el niño elegido y el historial anterior se conserva intacto.
export default function ReassignDialog({ open, quest, kids, currentName, busy, onConfirm, onClose }) {
  const [kidId, setKidId] = useState(null);

  useEffect(() => {
    if (!open) setKidId(null);
  }, [open]);

  if (!quest) return null;
  const chosen = kids.find((k) => k.id === kidId);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-lg font-extrabold">♻️ Reasignar tarea</DialogTitle>
          <DialogDescription>
            Se crea una nueva instancia para el niño elegido; el historial anterior se conserva completo.
          </DialogDescription>
        </DialogHeader>

        <div className="text-sm space-y-1">
          <p>
            <span className="text-muted-foreground">Tarea:</span>{" "}
            <span className="font-semibold">{quest.emoji} {quest.title}</span>
          </p>
          <p>
            <span className="text-muted-foreground">Actualmente asignada a:</span>{" "}
            <span className="font-semibold">{currentName}</span>
          </p>
        </div>

        <div>
          <p className="text-sm font-semibold mb-2">Reasignar a:</p>
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

        {chosen ? (
          <p className="rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-800 text-sm font-semibold p-3">
            Se reasignará '{quest.title}' a {chosen.name}.
          </p>
        ) : null}

        <div className="flex gap-2 justify-end">
          <Button variant="outline" disabled={busy} onClick={onClose}>Cancelar</Button>
          <Button className="font-bold" disabled={!chosen || busy}
            onClick={() => chosen && onConfirm(chosen.id)}>
            Reasignar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}