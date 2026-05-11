import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PDI | Protocolo de Diagnóstico Integral",
  description: "Plataforma de Inteligencia Clínica Avanzada",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>
        <div className="app-container">
          {/* Aquí irá el Sidebar más adelante */}
          <main className="main-content">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
