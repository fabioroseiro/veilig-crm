import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Noto_Sans } from "next/font/google";

/**
 * Fonte da marca, conforme o manual.
 *
 * Carregada pelo next/font: ela é servida junto com o site, sem requisição a
 * domínio de terceiros. Isso evita o "pisca" de fonte no carregamento e não
 * cria dependência externa numa tela de login.
 *
 * O manual traz Noto Sans e Aller. A Aller não tem licença livre para uso
 * web, então a marca escrita usa a Noto Sans — que é a primeira listada.
 */
const notoSans = Noto_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "600"],
  variable: "--fonte-marca",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Veilig — Painel",
  description: "Planos de manutenção recorrentes para concessionárias.",
};

/**
 * Sem isto, o celular renderiza a página como se a tela tivesse ~980px e
 * encolhe tudo para caber — obrigando a dar zoom com os dedos para ler
 * qualquer coisa. `width=device-width` faz o layout usar a largura real, que
 * é o que ativa as media queries de verdade.
 *
 * NÃO bloqueamos o zoom (nada de maximum-scale=1): quem precisa aumentar para
 * ler tem que poder. O que a viewport resolve é a página nascer no tamanho
 * certo, não impedir o ajuste.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className={notoSans.variable}>
      <head>
        {/* Aplica o tema salvo antes da renderização, evitando "piscar" de cor. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('veilig-theme');if(t==='dark'||t==='light'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}})();`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
