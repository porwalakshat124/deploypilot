"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

type Toast = { id: number; message: string; tone: "success" | "error" };
const ToastContext = createContext<((message: string, tone?: Toast["tone"]) => void) | null>(null);
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0), timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const dismiss = useCallback((id: number) => {
    clearTimeout(timers.current.get(id)); timers.current.delete(id);
    setToasts(items => items.filter(item => item.id !== id));
  }, []);
  const notify = useCallback((message: string, tone: Toast["tone"] = "success") => {
    const id = ++nextId.current;
    setToasts(items => [...items.slice(-2), { id, message, tone }]);
    if (tone === "success") timers.current.set(id, setTimeout(() => dismiss(id), 6000));
  }, [dismiss]);
  useEffect(() => { const pending = timers.current; return () => { pending.forEach(clearTimeout); pending.clear(); }; }, []);
  return <ToastContext.Provider value={notify}>{children}<div className="dp-toasts" aria-label="Notifications">{toasts.map(toast => <div key={toast.id} className={`dp-notice dp-notice-${toast.tone}`} role={toast.tone === "error" ? "alert" : "status"} aria-atomic="true"><span>{toast.message}</span><button type="button" className="dp-notice-close" aria-label="Dismiss notification" onClick={() => dismiss(toast.id)}>×</button></div>)}</div></ToastContext.Provider>;
}
export function useToast() {
  const notify = useContext(ToastContext);
  if (!notify) throw new Error("Toast provider is missing");
  return notify;
}
export function Notice({ message, tone = "error", retry, dismiss }: { message: string; tone?: "error" | "success" | "info"; retry?: () => void; dismiss?: () => void }) {
  if (!message) return null;
  return <div className={`dp-notice dp-notice-${tone}`} role={tone === "error" ? "alert" : "status"} aria-atomic="true"><span>{message}</span>{retry && <button type="button" className="dp-btn" onClick={retry}>Try again</button>}{dismiss && <button type="button" className="dp-notice-close" aria-label="Dismiss message" onClick={dismiss}>×</button>}</div>;
}
export function useFeedback() {
  const notify = useToast();
  const [message, setMessage] = useState("");
  return { message, clear: () => setMessage(""), fail: (error: unknown, fallback: string) => setMessage(error instanceof Error ? error.message : fallback), success: (text: string) => { setMessage(""); notify(text); } };
}
