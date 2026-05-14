"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/api";

// Captures uncaught JS errors + unhandled promise rejections at the document
// level and forwards them to /api/client-log. Mounted once in the root layout
// so every route is covered.
export default function GlobalErrorReporter() {
  useEffect(() => {
    const onError = (e: ErrorEvent) => {
      reportClientError({
        source: "window_error",
        message: e.message || "unknown error",
        stack: e.error?.stack ? String(e.error.stack).slice(0, 4000) : undefined,
      });
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      const reason = e.reason;
      const message = reason instanceof Error
        ? reason.message
        : typeof reason === "string" ? reason : "unhandled promise rejection";
      const stack = reason instanceof Error && reason.stack
        ? String(reason.stack).slice(0, 4000)
        : undefined;
      reportClientError({ source: "promise_rejection", message, stack });
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
