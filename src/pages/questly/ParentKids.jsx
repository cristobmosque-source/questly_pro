import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ErrorView, Loading } from "@/components/questly/ApiState";
import ConfirmDialog from "@/components/questly/ConfirmDialog";
import { api, fmtPoints } from "@/lib/questlyApi";
import { AVATARS, COLORS } from "@/lib/questlyData";
import { cn } from "@/lib/utils";

function KidForm({ initial, onSubmit, submitting, submitLabel }) {
  const [form, setForm] = useState(() => ({
    name: initial?.name || "",
    avatar: initial?.avatar || "",
    color: initial?.color || "",
    pin: "",
    points: initial?.points ?? 0,
  }));
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(form); }} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="k-name">Nombre</Label>
        <Input id="k-name" required maxLength={40} value={form.name} onChange={(e) => set("name")(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label>Avatar</Label>
        <div className="grid grid-cols-7 gap-1.5">
          {AVATARS.map((a) => (
            <button key={a} type="button" onClick={() => set("avatar")(a)}
              className={cn("rounded-xl py-2 text-xl border",
                form.avatar === a ? "bg-violet-600 border-violet-600" : "bg-white border-slate-200")}>
              {a}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Color</Label>
        <div className="flex gap-2 flex-wrap">
          {COLORS.map((c) => (
            <button key={c} type="button" onClick={() => set("color")(c)}
              className={cn("h-9 w-9 rounded-full border-4", form.color === c ? "border-slate-800" : "border-transparent")}
              style={{ backgroundColor: c }} />
          ))}
        </div>
      </div>
      {!initial ? (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="k-pin">PIN (4-6 dígitos, opcional)</Label>
            <Input id="k-pin" inputMode="numeric" maxLength={6}
              value={form.pin} onChange={(e) => set("pin")(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="k-points">Puntos iniciales</Label>
            <Input id="k-points" type="number" min={0} max={100000}
              value={form.points} onChange={(e) => set("points")(e.target.value)} />
          </div>
        </div>
      ) : (
        <div className="space-y-1.5">
          <Label htmlFor="k-pin2">
            PIN nuevo (4-6 dígitos, vacío para {initial?.has_pin ? "quitarlo" : "dejar sin PIN"})
          </Label>
          <Input id="k-pin2" inputMode="numeric" maxLength={6}
            value={form.pin} onChange={(e) => set("pin")(e.target.value)} />
        </div>
      )}
      <Button type="submit" disabled={submitting} className="w-full font-bold">
        {submitting ? "Guardando…" : submitLabel}
      </Button>
    </form>
  );
}

// Familia: alta y edición de niños (los adultos no juegan ni acumulan puntos).
export default function ParentKids() {
  const { toast } = useToast();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(null); // kid | "new"
  const [deleting, setDeleting] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await api("/parent/kids"));
    } catch (e) {
      setError(e);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const submit = async (payload) => {
    setBusy(true);
    try {
      if (editing === "new") {
        const res = await api("/parent/kids", {
          method: "POST",
          body: { ...payload, points: Number(payload.points) || 0 },
        });
        setData((d) => ({ ...d, kids: res.kids }));
        toast({ title: res.message });
      } else {
        const res = await api(`/parent/kids/${editing.id}`, {
          method: "POST",
          body: payload.pin ? { ...payload, action: "pin" } : payload,
        });
        if (res.kids) setData((d) => ({ ...d, kids: res.kids }));
        toast({ title: res.message });
      }
      setEditing(null);
    } catch (e) {
      toast({ title: "Ups", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    setBusy(true);
    try {
      const res = await api(`/parent/kids/${deleting.id}`, { method: "POST", body: { action: "delete" } });
      setData((d) => ({ ...d, kids: res.kids }));
      toast({ title: res.message });
      setDeleting(null);
    } catch (e) {
      toast({ title: "Ups", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  if (error) return <ErrorView error={error} onRetry={load} />;
  if (!data) return <Loading label="Cargando la familia…" />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">Niños</h1>
        <Button onClick={() => setEditing("new")} className="font-bold">
          <Plus className="h-4 w-4 mr-1" /> Agregar niño
        </Button>
      </div>

      <ul className="grid gap-3 sm:grid-cols-2">
        {data.kids.map((kid) => (
          <li key={kid.id} className="rounded-2xl bg-white border border-slate-100 shadow-sm p-4 flex items-center gap-3">
            <span className="h-12 w-12 rounded-full grid place-items-center text-2xl"
              style={{ backgroundColor: (kid.color || "#7c4dff") + "2e" }}>
              {kid.avatar}
            </span>
            <div className="flex-1 min-w-0">
              <Link to={`/parent/kids/${kid.id}`} className="font-bold hover:underline truncate block">{kid.name}</Link>
              <p className="text-xs text-muted-foreground">
                ⭐ {fmtPoints(kid.points)} · {kid.has_pin ? "con PIN" : "sin PIN"}
              </p>
            </div>
            <div className="flex gap-1">
              <Button size="icon" variant="ghost" onClick={() => setEditing(kid)} title="Editar">
                <Pencil className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" className="text-rose-500" onClick={() => setDeleting(kid)} title="Eliminar">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </li>
        ))}
      </ul>

      {data.parents.length > 1 ? (
        <p className="text-xs text-muted-foreground text-center">
          Adultos de la familia: {data.parents.map((p) => p.name).join(", ")}.
        </p>
      ) : null}

      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing === "new" ? "Agregar niño" : "Editar a " + (editing?.name || "")}</DialogTitle>
            <DialogDescription>
              El niño entra desde la página principal con su avatar (y PIN si tiene).
            </DialogDescription>
          </DialogHeader>
          {editing ? (
            <KidForm
              key={editing === "new" ? "new" : editing.id}
              initial={editing === "new" ? null : editing}
              onSubmit={submit}
              submitting={busy}
              submitLabel={editing === "new" ? "Agregar" : "Guardar"}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleting}
        destructive
        title={`¿Eliminar a ${deleting?.name || ""}?`}
        description="Se borrará también su historial, quests y recompensas. No se puede deshacer."
        confirmLabel="Eliminar"
        loading={busy}
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}