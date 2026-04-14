"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("App error:", error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-black">
      <div className="text-center px-4">
        <img
          src="/luka-logo.png"
          alt="Luka"
          className="mx-auto h-16 w-auto mb-8 opacity-50"
        />
        <h1 className="text-4xl font-bold text-white mb-4">
          Algo salio mal
        </h1>
        <p className="text-white/60 text-lg mb-8">
          Ocurrio un error inesperado. Si el problema persiste, contacta a
          soporte.
        </p>
        <button
          onClick={reset}
          className="inline-block rounded-lg bg-white text-black px-6 py-3 font-medium text-sm uppercase tracking-wider hover:bg-white/90 transition-colors"
        >
          Intentar de nuevo
        </button>
      </div>
    </div>
  );
}
