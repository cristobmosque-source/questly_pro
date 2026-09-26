import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function ConfirmDialog({
  open, title, description, confirmLabel = "Confirmar",
  cancelLabel = "Cancelar", destructive = false, loading = false,
  onConfirm, onCancel,
}) {
  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!o) onCancel && onCancel(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description ? <AlertDialogDescription>{description}</AlertDialogDescription> : null}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel} disabled={loading}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => { e.preventDefault(); onConfirm && onConfirm(); }}
            disabled={loading}
            className={destructive ? "bg-rose-600 hover:bg-rose-700 text-white" : undefined}
          >
            {loading ? "Aplicando…" : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}