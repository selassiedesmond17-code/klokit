"use client";

import { useEffect } from "react";

type Holder = { klokitPrompt?: Event };

export default function PwaRegister() {
  useEffect(() => {
    // Only on the live site, so development stays simple
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
    const onPrompt = (e: Event) => {
      e.preventDefault();
      (window as unknown as Holder).klokitPrompt = e;
    };
    const onInstalled = () => {
      (window as unknown as Holder).klokitPrompt = undefined;
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);
  return null;
}