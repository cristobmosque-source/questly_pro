import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ClipboardList, Database, KeyRound, RotateCcw, Settings as SettingsIcon, ShieldCheck, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ErrorView, Loading } from "@/components/questly/ApiState";
import ConfirmDialog from "@/components/questly/ConfirmDialog";
import { api, fmtMoney, fmtPoints, fmtWhen, notifyApprovalsChanged, notifyPointsChanged } from "@/lib/questlyApi";

function Section({ icon: Icon, title, subtitle, children }) {
  return (
    <section className="rounded-2xl bg-white border border-slate-100 shadow-sm p-5">
      <div className="flex items-center gap-3">
        <span className="h-10 w-10 rounded-xl bg-violet-50 grid place-items-center text-violet-600">
          <Icon className="h-5 w-5" />
        </span>
        <div>
          <h2 className="font-bold leading-tight">{title}</h2>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

// Configuración del adulto: familia, seguridad (PIN), copias de seguridad,
// reinicio de progreso (con doble confirmación) y datos generales.
export default function ParentSettings() {
  const { toast } = useToast();
  const [family, setFamily] = useState(null);   // /parent/kids
  const [security, setSecurity] = useState(null); // /parent/pin-requests
  const [backups, setBackups] = useState(null); // /parent/backups
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  // reinicio de progreso
  const [resetStage, setResetStage] = useState(null); // "warn" | "type"
  const [resetWord, setResetWord] = useState("");
  // copias de seguridad
  const [viewing, setViewing] = useState(null);
  const [restoring, setRestoring] = useState(null);
  // PIN de niños
  const [pinReq, setPinReq] = useState(null);
  const [newPin, setNewPin] = useState("");

  const load = useCallback(async () => {
    setError(null);
    try {
      const [f, s, b] = await Promise.all([
        api("/parent/kids"),
        api("/parent/pin-requests"),
        api("/parent/backups"),
      ]);
      setFamily(f);
      setSecurity(s);
      setBackups(b.backups);
    } catch (e) {
      setError(e);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ----- reinicio de progreso (doble confirmación) --------------------------

  const doReset = async () => {
    setBusy(true);
    try {
      const res = await api("/parent/progress/reset", { method: "POST" });
      setBackups(res.backups);
      toast({ title: "🔄 " + res.message });
      setResetStage(null);
      setResetWord("");
      notifyPointsChanged();
      notifyApprovalsChanged();
      await load();
    } catch (e) {
      toast({ title: "Ups", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const doRestore = async () => {
    setBusy(true);
    try {
      const res = await api(`/parent/backups/${restoring.id}/restore`, { method: "POST" });
      toast({ title: "💾 " + res.message });
      setRestoring(null);
      notifyPointsChanged();
      await load();
    } catch (e) {
      toast({ title: "Ups", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  // ----- solicitudes de PIN -------------------------------------------------

  const decidePin = async (request, action, pin = "") => {
    setBusy(true);
    try {
      const res = await api(`/parent/pin-requests/${request.id}`, {
        method: "POST",
        body: { action, pin },
      });
      toast({ title: action === "approve" ? "🔐 " + res.message : res.message });
      setPinReq(null);
      setNewPin("");
      await load();
      notifyApprovalsChanged();
    } catch (e) {
      toast({ title: "Ups", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  if (error) return <ErrorView error={error} onRetry={load} />;
  if (!family || !security || !backups) return <Loading label="Cargando configuración…" />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold flex items-center gap-2">
          <SettingsIcon className="h-6 w-6 text-violet-600" /> Configuración
        </h1>
        <p className="text-sm text-muted-foreground">Familia, seguridad y datos.</p>
      </div>

      <Section icon={Users} title="👨‍👩‍👧 Familia" subtitle="gestión de usuarios">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <p className="text-sm">
            <span className="font-semibold">{family.parents[0]?.name || "Adulto"}</span> y{" "}
            {family.kids.map((k) => k.name).join(", ")}.
          </p>
          <Link to="/parent/kids" className="text-sm font-semibold text-violet-700">Gestionar →</Link>
        </div>
      </Section>

      <Section icon={ShieldCheck} title="🔐 Seguridad" subtitle="PIN de niños y solicitudes de PIN olvidado">
        <ul className="text-sm space-y-1.5">
          {security.kids.map((k) => (
            <li key={k.id} className="flex items-center gap-2">
              <span>{k.avatar}</span>
              <span className="font-semibold">{k.name}</span>
              <span className="text-xs text-muted-foreground">
                {k.has_pin ? "🔒 PIN configurado (por seguridad no se muestra)" : "🔓 Sin PIN — entra directo y puede crear uno desde su perfil"}
              </span>
            </li>
          ))}
        </ul>

        {security.requests.length ? (
          <div className="mt-4 space-y-3">
            {security.requests.map((r) => (
              <div key={r.id} className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                <p className="font-bold text-amber-900">🔔 {r.kid_name} ha solicitado restablecer su PIN</p>
                <p className="text-xs text-amber-700 mt-0.5">Solicitado {fmtWhen(r.at)}</p>
                <div className="mt-3 flex gap-2 flex-wrap">
                  <Button size="sm" className="font-bold" disabled={busy}
                    onClick={() => { setPinReq(r); setNewPin(""); }}>
                    <KeyRound className="h-4 w-4 mr-1" /> Restablecer PIN
                  </Button>
                  <Button size="sm" variant="outline" disabled={busy}
                    onClick={() => decidePin(r, "reject")}>
                    Rechazar
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-xs text-muted-foreground">Sin solicitudes pendientes.</p>
        )}
      </Section>

      <Section icon={Database} title="💾 Copias de seguridad" subtitle="se crean automáticamente antes de cada reinicio · se conservan 30 días">
        {!backups.length ? (
          <p className="text-sm text-muted-foreground">
            Aún no hay copias. Cada vez que reinicies el progreso se guarda una automáticamente.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {backups.map((b) => (
              <li key={b.id} className="py-3 flex items-center gap-2 flex-wrap">
                <ClipboardList className="h-5 w-5 text-violet-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">
                    {fmtWhen(b.created_at)} — {b.name}
                    <span className="text-xs text-muted-foreground font-normal"> · v{b.version}</span>
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {b.kids.map((k) => `${k.name}: ⭐ ${fmtPoints(k.points)}`).join(" · ")}
                    {" · "}{b.txn_count} movimientos · {b.claim_count} quests · {b.redemption_count} canjes
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => setViewing(b)}>Ver</Button>
                <Button size="sm" variant="outline"
                  className="text-violet-700 border-violet-200 hover:bg-violet-50"
                  onClick={() => setRestoring(b)}>
                  Restaurar
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section icon={RotateCcw} title="🔄 Reiniciar progreso" subtitle="comienza una nueva etapa familiar desde cero">
        <p className="text-sm text-muted-foreground">
          Todos los niños vuelven a <span className="font-semibold">0 puntos</span>, sin historial, sin quests
          completadas, sin penalizaciones y sin rachas. Los usuarios, quests y recompensas{" "}
          <span className="font-semibold">NO se eliminan</span>. Antes de borrar se crea automáticamente una copia
          de seguridad que podrás restaurar durante 30 días.
        </p>
        <Button variant="outline" disabled={busy}
          className="mt-3 font-bold text-rose-600 border-rose-200 hover:bg-rose-50 hover:text-rose-700"
          onClick={() => { setResetStage("warn"); setResetWord(""); }}>
          <RotateCcw className="h-4 w-4 mr-1" /> Reiniciar progreso
        </Button>
      </Section>

      <Section icon={SettingsIcon} title="⚙️ Configuración general" subtitle="datos de la aplicación">
        <p className="text-sm text-muted-foreground">
          Questly — quests, puntos y recompensas para la familia. Equivalencia: ⭐ 1.000 puntos = {fmtMoney(1000)}.
        </p>
      </Section>

      {/* --- diálogo 1: advertencia del reinicio --- */}
      <Dialog open={resetStage === "warn"} onOpenChange={(o) => { if (!o) setResetStage(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>⚠️ Vas a reiniciar el progreso</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-muted-foreground space-y-2">
            <p>Esta acción reiniciará el progreso de todos los niños.</p>
            <p>Se eliminarán sus puntos, historial, claims, penalizaciones, progreso de rachas y redenciones.</p>
            <p className="font-semibold text-slate-700">Las quests, recompensas y usuarios NO serán eliminados.</p>
            <p>Antes de continuar se creará automáticamente una copia de seguridad que podrá restaurarse durante 30 días.</p>
          </div>
          <div className="mt-4 flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setResetStage(null)}>Cancelar</Button>
            <Button className="bg-rose-600 hover:bg-rose-700" onClick={() => setResetStage("type")}>
              Continuar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* --- diálogo 2: escribir REINICIAR --- */}
      <Dialog open={resetStage === "type"} onOpenChange={(o) => { if (!o) setResetStage(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Escribe REINICIAR para confirmar</DialogTitle>
          </DialogHeader>
          <Input
            value={resetWord}
            onChange={(e) => setResetWord(e.target.value.toUpperCase())}
            placeholder="REINICIAR"
          />
          <div className="mt-4 flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setResetStage(null)}>Cancelar</Button>
            <Button
              className="bg-rose-600 hover:bg-rose-700 font-bold"
              disabled={busy || resetWord !== "REINICIAR"}
              onClick={doReset}
            >
              {busy ? "Reiniciando…" : "Reiniciar progreso"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* --- ver backup --- */}
      <Dialog open={!!viewing} onOpenChange={(o) => { if (!o) setViewing(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{viewing?.name}</DialogTitle>
          </DialogHeader>
          {viewing ? (
            <div className="text-sm space-y-2">
              <p className="text-muted-foreground">
                Creado {fmtWhen(viewing.created_at)} · versión {viewing.version} · caduca {fmtWhen(viewing.expires_at)}
              </p>
              <ul className="space-y-1">
                {viewing.kids.map((k) => (
                  <li key={k.id} className="flex justify-between border-b border-slate-100 py-1.5">
                    <span className="font-semibold">{k.name}</span>
                    <span className="text-amber-600 font-bold">⭐ {fmtPoints(k.points)}</span>
                  </li>
                ))}
              </ul>
              <p className="text-muted-foreground">
                {viewing.txn_count} movimientos · {viewing.claim_count} quests completadas ·{" "}
                {viewing.redemption_count} canjes · incluye rachas y penalizaciones.
              </p>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* --- restaurar backup --- */}
      <ConfirmDialog
        open={!!restoring}
        title={`¿Restaurar la copia del ${restoring ? fmtWhen(restoring.created_at) : ""}?`}
        description="Volverán los puntos, historial, quests completadas y rachas que había antes del reinicio. El progreso actual se reemplaza."
        confirmLabel="Restaurar"
        loading={busy}
        onConfirm={doRestore}
        onCancel={() => setRestoring(null)}
      />

      {/* --- restablecer PIN de un niño --- */}
      <Dialog open={!!pinReq} onOpenChange={(o) => { if (!o) setPinReq(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restablecer PIN de {pinReq?.kid_name}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {pinReq?.kid_name} olvidó su PIN. Crea uno nuevo, o déjalo sin PIN para que él mismo cree uno desde su
            perfil. Por seguridad, el PIN actual nunca se muestra.
          </p>
          <div className="space-y-1.5">
            <Input
              inputMode="numeric" maxLength={6}
              placeholder="PIN nuevo (4-6 dígitos)"
              value={newPin}
              onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))}
            />
          </div>
          <div className="mt-2 flex gap-2 justify-end flex-wrap">
            <Button variant="outline" disabled={busy} onClick={() => decidePin(pinReq, "approve", "")}>
              Dejar sin PIN
            </Button>
            <Button className="font-bold" disabled={busy || !/^\d{4,6}$/.test(newPin)}
              onClick={() => decidePin(pinReq, "approve", newPin)}>
              Guardar nuevo PIN
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}