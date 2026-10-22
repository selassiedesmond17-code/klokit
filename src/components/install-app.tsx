"use client";

import { useRef } from "react";

type PromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};

export default function InstallApp() {
  const details = useRef<HTMLDetailsElement>(null);

  async function install() {
    const holder = window as unknown as { klokitPrompt?: PromptEvent };
    const e = holder.klokitPrompt;
    if (!e) {
      // No automatic prompt on this browser: show the steps instead
      details.current?.setAttribute("open", "");
      return;
    }
    holder.klokitPrompt = undefined;
    await e.prompt();
    await e.userChoice;
  }

  function hide() {
    try {
      localStorage.setItem("installHidden", "1");
    } catch {
      // storage unavailable
    }
    document.documentElement.setAttribute("data-install-hidden", "1");
  }

  return (
    <section className="install-card neu-card mt-6 flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium">Install KlokIt on your phone</h2>
          <p className="muted text-sm">
            Opens from your home screen, full screen, with the K icon.
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={install} className="neu-btn neu-btn-primary">
            Install app
          </button>
          <button type="button" onClick={hide} className="neu-btn">
            Not now
          </button>
        </div>
      </div>
      <details ref={details} className="neu-details text-sm">
        <summary>How to install on iPhone, or if the button does nothing</summary>
        <ul className="muted mt-2 flex list-disc flex-col gap-1 pl-5">
          <li>
            <strong>iPhone or iPad (Safari):</strong> tap the Share button, then{" "}
            <em>Add to Home Screen</em>, then <em>Add</em>.
          </li>
          <li>
            <strong>Android (Chrome):</strong> tap the ⋮ menu, then{" "}
            <em>Install app</em> (or <em>Add to Home screen</em>).
          </li>
          <li>
            <strong>Computer (Chrome or Edge):</strong> click the install icon at
            the right end of the address bar.
          </li>
        </ul>
      </details>
    </section>
  );
}