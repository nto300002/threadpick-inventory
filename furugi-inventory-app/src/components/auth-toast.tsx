"use client";

import { useEffect, useState } from "react";
import styles from "./auth-toast.module.css";

type AuthToastIntent = "success" | "error";

export type AuthToastState = {
  intent: AuthToastIntent;
  message: string;
};

const authToastStorageKey = "threadpick-auth-toast";

export function queueAuthToast(toast: AuthToastState) {
  window.sessionStorage.setItem(authToastStorageKey, JSON.stringify(toast));
}

export function useQueuedAuthToast() {
  const [toast, setToast] = useState<AuthToastState | null>(() => {
    if (typeof window === "undefined") return null;
    const queuedToast = window.sessionStorage.getItem(authToastStorageKey);
    if (!queuedToast) return null;

    window.sessionStorage.removeItem(authToastStorageKey);
    try {
      const parsed = JSON.parse(queuedToast) as AuthToastState;
      if (parsed.message && (parsed.intent === "success" || parsed.intent === "error")) {
        return parsed;
      }
    } catch {
      return null;
    }
    return null;
  });

  useEffect(() => {
    if (!toast) return;
    const timeoutId = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(timeoutId);
  }, [toast]);

  return [toast, setToast] as const;
}

export function AuthToast({ toast }: { toast: AuthToastState | null }) {
  if (!toast) return null;

  const title = toast.intent === "success" ? "成功しました" : "失敗しました";

  return (
    <div
      className={`${styles.toast} ${toast.intent === "success" ? styles.success : styles.error}`}
      role={toast.intent === "success" ? "status" : "alert"}
    >
      <p className={styles.title}>{title}</p>
      <p className={styles.message}>{toast.message}</p>
    </div>
  );
}
