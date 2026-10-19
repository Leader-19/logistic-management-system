export type ToastKind = "success" | "error";

export function showToast(message: string, kind: ToastKind = "success") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("lms:toast", { detail: { message, kind } }));
}
