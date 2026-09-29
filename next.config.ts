import type { NextConfig } from "next";

const config: NextConfig = {
  // O pdfkit lê as próprias fontes do disco: fica fora do bundle.
  serverExternalPackages: ["pdfkit"],
  // Fontes da marca e logo usadas no PDF da proposta precisam ir junto na função da Vercel.
  outputFileTracingIncludes: {
    "/p/[token]/pdf": ["./lib/fontes-pdf/**", "./public/logo.png", "./node_modules/pdfkit/js/data/**"],
    "/grupos/[id]/propostas/[pid]": ["./lib/fontes-pdf/**", "./public/logo.png", "./node_modules/pdfkit/js/data/**"],
  },
};
export default config;
