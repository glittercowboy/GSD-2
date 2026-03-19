"use client";

import { useState, useEffect, useCallback } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

// Capture the event as early as possible — before React even mounts.
// The `beforeinstallprompt` fires once, often before any component
// has a chance to add a listener, so we stash it on the window.
declare global {
  interface Window {
    __gsdDeferredInstallPrompt?: BeforeInstallPromptEvent;
  }
}

if (typeof window !== "undefined") {
  window.addEventListener(
    "beforeinstallprompt",
    (e: Event) => {
      e.preventDefault();
      window.__gsdDeferredInstallPrompt = e as BeforeInstallPromptEvent;
      // Dispatch a custom event so any already-mounted listener can pick it up.
      window.dispatchEvent(new Event("gsd:install-prompt-ready"));
    },
    { once: true },
  );
}

export function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Already installed (standalone mode)
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true);
      return;
    }

    // Pick up an already-captured event (fired before this component mounted)
    if (window.__gsdDeferredInstallPrompt) {
      setDeferredPrompt(window.__gsdDeferredInstallPrompt);
    }

    // Also listen for the event if it fires after mount
    const promptHandler = () => {
      if (window.__gsdDeferredInstallPrompt) {
        setDeferredPrompt(window.__gsdDeferredInstallPrompt);
      }
    };

    const installedHandler = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      delete window.__gsdDeferredInstallPrompt;
    };

    window.addEventListener("gsd:install-prompt-ready", promptHandler);
    window.addEventListener("appinstalled", installedHandler);

    return () => {
      window.removeEventListener("gsd:install-prompt-ready", promptHandler);
      window.removeEventListener("appinstalled", installedHandler);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    delete window.__gsdDeferredInstallPrompt;
    return outcome === "accepted";
  }, [deferredPrompt]);

  return {
    canInstall: !!deferredPrompt && !isInstalled,
    isInstalled,
    promptInstall,
  };
}
