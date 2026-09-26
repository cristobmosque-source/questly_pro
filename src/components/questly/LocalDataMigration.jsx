import { useState } from "react";
import { CloudUpload, HardDriveUpload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/questlyApi";

const V3_KEY = "questly_store_v3";
const LEGACY_KEY = "questly_demo_v2";

// ¿Hay datos de la versión anterior guardados en este navegador?
export function hasLocalQuestlyData() {
  try {
    return !!(localStorage.getItem(V3_KEY) || localStorage.getItem(LEGACY_KEY));
  } catch {
    return false;
  }
}

// Migra los datos guardados en este navegador a la base de datos del servidor.
// Solo tras confirmar que la importación fue exitosa se limpia el navegador.
export default function LocalDataMigration({ onImported }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const run = async () => {
    setBusy(true);
    setError("");
    try {
      const isV3 = !!localStorage.getItem(V3_KEY);
      const raw = localStorage.getItem(isV3 ? V3_KEY : LEGACY_KEY);
      const snapshot = JSON.parse(raw);
      const res = await api("/admin/import", {
        method: "POST",
        body: { snapshot, legacy: !isV3 },
      });
      localStorage.removeItem(V3_KEY);
      localStorage.removeItem(LEGACY_KEY);
      if (onImported) onImported(res);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-4 rounded-3xl border-2 border-violet-200 bg-violet-50 p-5">
      <div className="flex items-start gap-3">
        <span className="h-11 w-11 rounded-2xl bg-white grid place-items-center text-violet-600 shadow-sm shrink-0">
          <HardDriveUpload className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h3 className="font-bold text-violet-900 leading-tight">Tus datos de Questly están en este navegador</h3>
          <p className="text-xs text-violet-700 mt-1">
            Encontramos quests, puntos e historial guardados localmente. Súbelos al servidor para que
            queden guardados para siempre y disponibles en cualquier dispositivo. El navegador se limpia
            solo después de comprobar que todo llegó bien.
          </p>
        </div>
      </div>
      {error ? <p className="mt-3 text-sm text-rose-600">{error}</p> : null}
      <Button onClick={run} disabled={busy} className="mt-3 w-full font-bold">
        <CloudUpload className="h-4 w-4 mr-1" />
        {busy ? "Subiendo al servidor…" : "Subir mis datos al servidor"}
      </Button>
    </div>
  );
}