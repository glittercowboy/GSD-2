"use client";

import { useState, useEffect, useCallback, useSyncExternalStore } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISPLAY_MODE_QUERY = "(display-mode: standalone)";
let installPromptInstalled = false;

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

function subscribeInstalled(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};

  const mediaQuery = window.matchMedia(DISPLAY_MODE_QUERY);
  const handleInstalled = () => {
    installPromptInstalled = true;
    onStoreChange();
  };
  const handleChange = () => onStoreChange();

  window.addEventListener("appinstalled", handleInstalled);
  mediaQuery.addEventListener?.("change", handleChange);

  return () => {
    window.removeEventListener("appinstalled", handleInstalled);
    mediaQuery.removeEventListener?.("change", handleChange);
  };
}

function getInstalledSnapshot(): boolean {
  if (typeof window === "undefined") return installPromptInstalled;
  return installPromptInstalled || window.matchMedia(DISPLAY_MODE_QUERY).matches;
}

export function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const isInstalled = useSyncExternalStore(subscribeInstalled, getInstalledSnapshot, () => false);

  useEffect(() => {
    // Pick up an already-captured event (fired before this component mounted)
    const syncPrompt = () => {
      if (!window.__gsdDeferredInstallPrompt) return
      window.setTimeout(() => {
        setDeferredPrompt(window.__gsdDeferredInstallPrompt ?? null)
      }, 0)
    }

    syncPrompt()

    // Also listen for the event if it fires after mount
    const promptHandler = () => {
      syncPrompt()
    }

    window.addEventListener("gsd:install-prompt-ready", promptHandler)

    return () => {
      window.removeEventListener("gsd:install-prompt-ready", promptHandler)
    }
  }, [])

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
