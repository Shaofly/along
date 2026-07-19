"use client";

import { ModalSurface } from "@/app/components/ModalSurface";

export function ConfirmDialog({
  busy = false,
  cancelLabel = "取消",
  confirmLabel,
  description,
  onCancel,
  onConfirm,
  open,
  title,
  tone = "default",
}: {
  busy?: boolean;
  cancelLabel?: string;
  confirmLabel: string;
  description: string;
  onCancel: () => void;
  onConfirm: () => void;
  open: boolean;
  title: string;
  tone?: "danger" | "default";
}) {
  const titleId = "shared-confirm-dialog-title";

  return (
    <ModalSurface
      labelledBy={titleId}
      onRequestClose={() => {
        if (!busy) onCancel();
      }}
      open={open}
      role="alertdialog"
      size="compact"
    >
      <div className="draft-dialog shared-confirm-dialog">
        <h2 id={titleId}>{title}</h2>
        <p>{description}</p>
        <div className="draft-dialog-actions">
          <button
            className={tone === "danger" ? "draft-danger-action" : "draft-save-action"}
            data-modal-initial-focus
            disabled={busy}
            onClick={onConfirm}
            type="button"
          >
            {busy ? "正在处理" : confirmLabel}
          </button>
          <button disabled={busy} onClick={onCancel} type="button">
            {cancelLabel}
          </button>
        </div>
      </div>
    </ModalSurface>
  );
}
