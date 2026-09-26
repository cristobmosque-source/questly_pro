import { useState } from "react";
import { Database, Plug, RotateCcw, Settings as SettingsIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import ConfirmDialog from "@/components/questly/ConfirmDialog";
import {
  clearSession, getApiBase, isDemoMode, restoreDemoData, setApiBase, setMode,
} from "@/lib/questlyApi";
import { cn } from "@/lib/utils";

// Configuración del adulto: modo de datos (demo / servidor Flask), dirección
// del servidor y restauración de los datos demo.

function restart() {
  clearSession();
  window.location.href = "/";
}

export default function ParentSettings() {
  const demo = isDemoMode();
  const [url, setUrl] = useState(getApiBase());
  const [confirming, setConfirming] = useState(false);
  const [switching, setSwitching] = useState(false);

  const connectServer = () => {
    setSwitching(true);
    setApiBase(url);
    setMode("api");
    restart();
  };

  const backToDemo = () => {
    setSwitching(true);
    setMode("demo");
    restart();
  };

  const doRestore = () => {
    restoreDemoData();
    setMode("demo");
    restart();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold flex items-center gap-2">
          <SettingsIcon className="h-6 w-6 text-violet-600" /> Configuración
        </h1>
        <p className="text-sm text-muted-foreground">Modo de datos y accesos.</p>
      </div>

      <section className="rounded-2xl bg-white border border-slate-100 shadow-sm p-5 space-y-3">
        <h2 className="font-bold">Modo de datos</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            onClick={demo ? undefined : backToDemo}
            className={cn("text-left rounded-2xl border-2 p-4 transition-colors",
              demo ? "border-violet-600 bg-violet-50" : "border-slate-200 hover:border-violet-300")}
            disabled={switching}
          >
            <p className="font-bold flex items-center gap-2">
              <Database className="h-4 w-4" /> Demo (este preview)
              {demo ? <span className="ml-auto text-xs rounded-full bg-violet-600 text-white px-2 py-0.5">Activo</span> : null}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Datos guardados en este navegador. Ideal para probar la app sin servidor.
            </p>
          </button>
          <div className={cn("rounded-2xl border-2 p-4",
            !demo ? "border-violet-600 bg-violet-50" : "border-slate-200")}>
            <p className="font-bold flex items-center gap-2">
              <Plug className="h-4 w-4" /> Servidor Questly
              {!demo ? <span className="ml-auto text-xs rounded-full bg-violet-600 text-white px-2 py-0.5">Activo</span> : null}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Conecta el backend Flask/MongoDB (<code className="text-xs">docker compose up</code>).
            </p>
            {!demo ? (
              <p className="text-xs text-muted-foreground mt-2">Dirección: {getApiBase()}</p>
            ) : (
              <div className="mt-3 space-y-2">
                <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="http://localhost:37000" />
                <Button className="w-full font-bold" disabled={switching} onClick={connectServer}>
                  Conectar
                </Button>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-2xl bg-white border border-slate-100 shadow-sm p-5">
        <h2 className="font-bold mb-1">Datos demo</h2>
        <p className="text-sm text-muted-foreground mb-3">
          Vuelve al estado inicial: Samuel (120 pts), Lorenza (85 pts), sus quests y las recompensas de la tienda.
          Se cerrará tu sesión.
        </p>
        <Button variant="outline" className="font-bold text-rose-600 border-rose-200 hover:bg-rose-50 hover:text-rose-700"
          onClick={() => setConfirming(true)}>
          <RotateCcw className="h-4 w-4 mr-1" /> Restaurar datos demo
        </Button>
      </section>

      <section className="rounded-2xl bg-white border border-slate-100 shadow-sm p-5">
        <h2 className="font-bold mb-2">Accesos del modo demo</h2>
        <ul className="text-sm space-y-1.5">
          <li>👦 <span className="font-semibold">Samuel</span> — PIN <code className="bg-slate-100 rounded px-1.5 py-0.5 font-mono">1234</code></li>
          <li>👧 <span className="font-semibold">Lorenza</span> — PIN <code className="bg-slate-100 rounded px-1.5 py-0.5 font-mono">5678</code></li>
          <li>👨 <span className="font-semibold">Papá / CMB</span> — contraseña <code className="bg-slate-100 rounded px-1.5 py-0.5 font-mono">admin</code></li>
        </ul>
      </section>

      <ConfirmDialog
        open={confirming}
        destructive
        title="¿Restaurar los datos demo?"
        description="Se borrarán todos los cambios hechos en el modo demo (claims, puntos, recompensas, niños agregados) y volverá el estado inicial."
        confirmLabel="Sí, restaurar"
        loading={switching}
        onConfirm={doRestore}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}