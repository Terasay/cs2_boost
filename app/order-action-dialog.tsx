"use client";

import {
  useEffect,
  useId,
  useRef,
  type FormEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

export function OrderActionDialog({
  title,
  context,
  children,
  confirmLabel,
  ru,
  busy,
  disabled,
  destructive,
  onClose,
  onSubmit,
}: {
  title: string;
  context: string;
  children: ReactNode;
  confirmLabel: string;
  ru: boolean;
  busy: boolean;
  disabled: boolean;
  destructive: boolean;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const element = dialog.current;
    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    element?.showModal();
    element
      ?.querySelector<HTMLElement>("[data-dialog-focus]")
      ?.focus({ preventScroll: true });
    return () => {
      element?.close();
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);
  return createPortal(
    <dialog
      ref={dialog}
      className="order-action-dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <form onSubmit={onSubmit} aria-busy={busy}>
        <header className="order-action-heading">
          <div>
            <p>{context}</p>
            <h2 id={titleId}>{title}</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label={ru ? "Закрыть окно" : "Close dialog"}
            disabled={busy}
            onClick={onClose}
          >
            <X size={19} />
          </button>
        </header>
        <div className="order-editor order-action-body">{children}</div>
        <footer className="order-action-footer">
          <button
            type="button"
            className="secondary-action"
            disabled={busy}
            onClick={onClose}
          >
            {ru ? "Вернуться" : "Go back"}
          </button>
          <button
            type="submit"
            className={destructive ? "danger-action" : "compact-primary"}
            disabled={busy || disabled}
          >
            {busy ? (ru ? "Сохраняем…" : "Saving…") : confirmLabel}
          </button>
        </footer>
      </form>
    </dialog>,
    document.body,
  );
}
