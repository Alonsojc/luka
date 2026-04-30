import Link from "next/link";

const pageStyle = {
  alignItems: "center",
  background: "#000",
  color: "#fff",
  display: "flex",
  justifyContent: "center",
  minHeight: "100vh",
  textAlign: "center" as const,
};

const logoStyle = {
  height: 64,
  marginBottom: 32,
  opacity: 0.5,
  width: "auto",
};

const linkStyle = {
  background: "#fff",
  borderRadius: 8,
  color: "#000",
  display: "inline-block",
  fontSize: 14,
  fontWeight: 500,
  letterSpacing: "0.08em",
  padding: "12px 24px",
  textDecoration: "none",
  textTransform: "uppercase" as const,
};

export default function Custom404() {
  return (
    <main style={pageStyle}>
      <section style={{ padding: 16 }}>
        <img src="/luka-logo.png" alt="Luka" style={logoStyle} />
        <h1 style={{ fontSize: 64, fontWeight: 700, margin: "0 0 16px" }}>404</h1>
        <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 18, margin: "0 0 32px" }}>
          La pagina que buscas no existe o fue movida.
        </p>
        <Link href="/dashboard" style={linkStyle}>
          Ir al Dashboard
        </Link>
      </section>
    </main>
  );
}
