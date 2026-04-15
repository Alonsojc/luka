import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-black">
      <div className="text-center px-4">
        <img src="/luka-logo.png" alt="Luka" className="mx-auto h-16 w-auto mb-8 opacity-50" />
        <h1 className="text-6xl font-bold text-white mb-4">404</h1>
        <p className="text-white/60 text-lg mb-8">La pagina que buscas no existe o fue movida.</p>
        <Link
          href="/dashboard"
          className="inline-block rounded-lg bg-white text-black px-6 py-3 font-medium text-sm uppercase tracking-wider hover:bg-white/90 transition-colors"
        >
          Ir al Dashboard
        </Link>
      </div>
    </div>
  );
}
