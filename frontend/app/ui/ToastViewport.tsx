"use client";

import { useEffect, useState } from "react";

type Toast = { id: number; message: string; kind: "success" | "error" };

export default function ToastViewport() {
  const [toast, setToast] = useState<Toast | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const show = (event: Event) => {
      const detail = (event as CustomEvent<{ message?: unknown; kind?: unknown }>).detail;
      if (typeof detail?.message !== "string" || !detail.message) return;
      const next = { id: Date.now(), message: detail.message, kind: detail.kind === "error" ? "error" as const : "success" as const };
      setToast(next);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setToast(current => current?.id === next.id ? null : current), 4200);
    };
    window.addEventListener("lms:toast", show);
    return () => { window.removeEventListener("lms:toast", show); if (timer) clearTimeout(timer); };
  }, []);

  if (!toast) return null;
  return <div className={`app-toast app-toast-${toast.kind}`} role={toast.kind === "error" ? "alert" : "status"} aria-live={toast.kind === "error" ? "assertive" : "polite"}>
    <span className="app-toast-icon" aria-hidden="true">{toast.kind === "error" ? "!" : "✓"}</span>
    <span>{toast.message}</span>
    <button type="button" onClick={() => setToast(null)} aria-label="Dismiss notification">×</button>
  </div>;
}
