"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { DotsLoader } from "@/components/loaders";


// The loader stays visible at least this long, so it never just flickers.
// Lower the number for a snappier feel, raise it for a longer animation.
const MIN_VISIBLE_MS = 450;
// Safety net: never leave the loader up forever
const GIVE_UP_MS = 10000;

export default function NavigationFeedback() {
  const pathname = usePathname();
  const [nav, setNav] = useState<{ id: number; from: string } | null>(null);

  useEffect(() => {
    function start() {
      const id = Date.now();
      setNav({ id, from: window.location.pathname });
      window.setTimeout(
        () => setNav((n) => (n && n.id === id ? null : n)),
        GIVE_UP_MS
      );
    }

    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const target = e.target as Element | null;
      const a = target?.closest("a");
      if (!a) return;
      const href = a.getAttribute("href");
      if (!href || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname) return;
      if (url.pathname.endsWith("/export")) return; // CSV download
      start();
    }

    document.addEventListener("click", onClick, true);
    window.addEventListener("app-navigate", start);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("app-navigate", start);
    };
  }, []);

  // When the new page has arrived, keep the loader up until the minimum time is over
  useEffect(() => {
    if (!nav || nav.from === pathname) return;
    const remaining = Math.max(0, MIN_VISIBLE_MS - (Date.now() - nav.id));
    const t = window.setTimeout(
      () => setNav((n) => (n && n.id === nav.id ? null : n)),
      remaining
    );
    return () => window.clearTimeout(t);
  }, [pathname, nav]);

  if (!nav) return null;
  return (
    <>
      <div className="nav-bar" aria-hidden="true" />
      <div className="nav-overlay" role="status" aria-live="polite">
        <DotsLoader />
        <p className="made-by"><strong>KlokIt</strong></p>
        <span className="sr-only">Loading…</span>
      </div>
    </>
  );
}