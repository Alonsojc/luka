"use client";

import { useEffect, useState } from "react";
import { X, Download } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISSED_KEY = "luka-pwa-install-dismissed";

export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(DISMISSED_KEY)) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setVisible(true);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setVisible(false);
    }
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setVisible(false);
    localStorage.setItem(DISMISSED_KEY, "true");
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-between gap-4 bg-black px-4 py-3 shadow-lg sm:px-6">
      <div className="flex items-center gap-3 text-white">
        <Download className="h-5 w-5 flex-shrink-0" />
        <span className="text-sm font-medium">Instalar Luka System en tu dispositivo</span>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={handleInstall}
          className="rounded-lg bg-white px-4 py-1.5 text-sm font-semibold text-black transition-colors hover:bg-gray-200"
        >
          Instalar
        </button>
        <button
          onClick={handleDismiss}
          className="rounded-lg p-1.5 text-white/60 transition-colors hover:text-white"
          aria-label="Cerrar"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
