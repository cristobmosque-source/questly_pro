import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ErrorView, Loading } from "@/components/questly/ApiState";
import ConfirmDialog from "@/components/questly/ConfirmDialog";
import StreaksPanel from "@/components/questly/StreaksPanel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/questlyApi";

const STOCK_MODES = [
  { value: "unlimited", label: "Sin límite" },
  { value: "fixed", label: "Stock fijo" },
  { value: "periodic", label: "Cupo por período" },
];

function RewardForm({ initial, kids = [], onSubmit, submitting, submitLabel }) {
  const [form, setForm] = useState(() => ({
    title: initial?.title || "",
    emoji: initial?.emoji || "",
    cost: initial?.cost ?? 10,
    description: initial?.description || "",
    stock_mode: initial?.stock_mode || "unlimited",
    stock: initial?.stock ?? 1,
    stock_limit: initial?.stock_limit ?? 1,
    stock_period: initial?.stock_period || "daily",
    stock_scope: initial?.stock_scope || "child",
  }));
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  // Niños que pueden usar esta recompensa: lista vacía = todos los niños.
  const [assigned, setAssigned] = useState(() => initial?.assigned_to || []);
  const allKids = !assigned.length;

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit({ ...form, assigned_to: assigned }); }} className="space-y-4">
      <div className="grid grid-cols-[1fr_4.5rem_6rem] gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="r-title">Nombre</Label>
          <Input id="r-title" required maxLength={80} value={form.title} onChange={(e) => set("title")(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="r-emoji">Emoji</Label>
          <Input id="r-emoji" className="text-center text-lg" maxLength={4}
            value={form.emoji} onChange={(e) => set("emoji")(e.target.value)} placeholder="🎁" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="r-cost">Costo</Label>
          <Input id="r-cost" type="number" min={1} max={100000} required
            value={form.cost} onChange={(e) => set("cost")(e.target.value)} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="r-desc">Descripción (opcional)</Label>
        <Textarea id="r-desc" rows={2} maxLength={240}
          value={form.description} onChange={(e) => set("description")(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label>Disponible para</Label>
        <div className="rounded-xl border border-slate-200 p-3 space-y-2">
          <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer">
            <Checkbox checked={allKids}
              onCheckedChange={(c) => setAssigned(c ? [] : kids.map((k) => k.id))} />
            Todos los niños
          </label>
          {!allKids ? (
            <div className="pl-1 flex flex-col gap-2">
              {kids.map((k) => (
                <label key={k.id} className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox checked={assigned.includes(k.id)}
                    onCheckedChange={() =>
                      setAssigned((a) => a.includes(k.id) ? a.filter((x) => x !== k.id) : [...a, k.id])
                    } />
                  {k.avatar} {k.name}
                </label>
              ))}
              {!kids.length ? (
                <p className="text-xs text-muted-foreground">Aún no hay niños creados.</p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Disponibilidad</Label>
        <Select value={form.stock_mode} onValueChange={set("stock_mode")}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {STOCK_MODES.map((m) => (
              <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {form.stock_mode === "fixed" ? (
        <div className="space-y-1.5">
          <Label htmlFor="r-stock">Cantidad en stock</Label>
          <Input id="r-stock" type="number" min={0} max={9999}
            value={form.stock} onChange={(e) => set("stock")(e.target.value)} />
        </div>
      ) : null}
      {form.stock_mode === "periodic" ? (
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="r-limit">Cupo</Label>
            <Input id="r-limit" type="number" min={1} max={999}
              value={form.stock_limit} onChange={(e) => set("stock_limit")(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Período</Label>
            <Select value={form.stock_period} onValueChange={set("stock_period")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Al día</SelectItem>
                <SelectItem value="weekly">A la semana</SelectItem>
                <SelectItem value="monthly">Al mes</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Alcance</Label>
            <Select value={form.stock_scope} onValueChange={set("stock_scope")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="child">Cada niño</SelectItem>
                <SelectItem value="family">Toda la familia</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      ) : null}
      <Button type="submit" disabled={submitting} className="w-full font-bold">
        {submitting ? "Guardando…" : submitLabel}
      </Button>
    </form>
  );
}

// Administración de recompensas (mismos modos de stock del backend).
export default function ParentRewards() {
  const { toast } = useToast();
  const [rewards, setRewards] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [kids, setKids] = useState([]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await api("/parent/rewards");
      setRewards(data.rewards);
      setKids(data.kids || []);
    } catch (e) {
      setError(e);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const submit = async (payload) => {
    setBusy(true);
    try {
      const res = editing === "new"
        ? await api("/parent/rewards", { method: "POST", body: payload })
        : await api(`/parent/rewards/${editing.id}`, { method: "POST", body: payload });
      setRewards(res.rewards);
      toast({ title: res.message });
      setEditing(null);
    } catch (e) {
      toast({ title: "Ups", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (r) => {
    try {
      const res = await api(`/parent/rewards/${r.id}`, { method: "POST", body: { action: "toggle" } });
      setRewards(res.rewards);
    } catch (e) {
      toast({ title: "Ups", description: e.message, variant: "destructive" });
    }
  };

  const confirmDelete = async () => {
    setBusy(true);
    try {
      const res = await api(`/parent/rewards/${deleting.id}`, { method: "POST", body: { action: "delete" } });
      setRewards(res.rewards);
      toast({ title: res.message });
      setDeleting(null);
    } catch (e) {
      toast({ title: "Ups", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  if (error) return <ErrorView error={error} onRetry={load} />;
  if (!rewards) return <Loading label="Cargando recompensas…" />;

  const kidName = (id) => (kids.find((k) => k.id === id) || {}).name || id;

  return (
    <div className="space-y-6">
      <Tabs defaultValue="rewards" className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h1 className="text-2xl font-extrabold">Recompensas</h1>
        </div>
        <TabsList className="w-full max-w-xs grid grid-cols-2">
          <TabsTrigger value="rewards">🎁 Recompensas</TabsTrigger>
          <TabsTrigger value="streaks">🔥 Rachas</TabsTrigger>
        </TabsList>

        <TabsContent value="rewards" className="space-y-6 focus-visible:outline-none">
          <div className="flex items-center justify-end">
            <Button onClick={() => setEditing("new")} className="font-bold">
              <Plus className="h-4 w-4 mr-1" /> Nueva recompensa
            </Button>
          </div>

          <ul className="space-y-3">
        {rewards.map((r) => (
          <li key={r.id} className={"rounded-2xl bg-white border border-slate-100 shadow-sm p-4 flex items-center gap-3 flex-wrap " + (r.active ? "" : "opacity-60")}>
            <span className="h-11 w-11 rounded-xl bg-violet-50 grid place-items-center text-2xl">{r.emoji}</span>
            <div className="flex-1 min-w-0">
              <p className="font-bold">{r.title} <span className="text-amber-600 font-extrabold text-sm">⭐ {r.cost}</span></p>
              <p className="text-xs text-muted-foreground">
                {r.assigned_to && r.assigned_to.length
                  ? "Disponible para: " + r.assigned_to.map(kidName).join(", ")
                  : "Disponible para: todos los niños"}
              </p>
              <p className="text-xs text-muted-foreground">
                {r.stock_mode === "unlimited" ? "Sin límite" : ""}
                {r.stock_mode === "fixed" ? `Stock fijo: ${r.stock}` : ""}
                {r.stock_mode === "periodic"
                  ? `${r.stock_limit} ${r.stock_period === "daily" ? "al día" : r.stock_period === "weekly" ? "a la semana" : "al mes"} — ${r.stock_scope === "child" ? "cada niño" : "toda la familia"}`
                  : ""}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={r.active} onCheckedChange={() => toggle(r)} />
              <Button size="icon" variant="ghost" onClick={() => setEditing(r)} title="Editar">
                <Pencil className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" className="text-rose-500" onClick={() => setDeleting(r)} title="Eliminar">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </li>
        ))}
            {!rewards.length ? (
              <li className="rounded-2xl bg-white border border-slate-100 shadow-sm p-8 text-center text-sm text-muted-foreground">
                La tienda está vacía. Agrega la primera recompensa.
              </li>
            ) : null}
          </ul>
        </TabsContent>

        <TabsContent value="streaks" className="focus-visible:outline-none">
          <StreaksPanel />
        </TabsContent>
      </Tabs>

      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing === "new" ? "Nueva recompensa" : "Editar recompensa"}</DialogTitle>
            <DialogDescription>
              Las reglas de stock y canje se aplican en el servidor.
            </DialogDescription>
          </DialogHeader>
          {editing ? (
            <RewardForm
              key={editing === "new" ? "new" : editing.id}
              initial={editing === "new" ? null : editing}
              kids={kids}
              onSubmit={submit}
              submitting={busy}
              submitLabel={editing === "new" ? "Crear recompensa" : "Guardar cambios"}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleting}
        destructive
        title={`¿Eliminar '${deleting?.title || ""}'?`}
        description="Los niños que la tenían como meta volverán al objetivo automático."
        confirmLabel="Eliminar"
        loading={busy}
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}