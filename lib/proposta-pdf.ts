import "server-only";
import path from "path";
import fs from "fs";
import PDFDocument from "pdfkit";
import type { ConteudoProposta, Secao } from "./proposta-conteudo";

const COR = { ink: "#173b43", acc: "#4ec3e0", muted: "#58707a", line: "#d7e4e7", soft: "#f2f7f8", accSoft: "#e3f5fa" };
const RAIZ = process.cwd();
const fonte = (nome: string) => path.join(RAIZ, "lib/fontes-pdf", `NotoSans-${nome}.ttf`);

/** Gera o PDF da proposta (A4) e devolve os bytes. */
export function gerarPdfProposta(c: ConteudoProposta): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margins: { top: 56, bottom: 64, left: 56, right: 56 }, bufferPages: true,
    info: { Title: `Proposta comercial ${c.numero} — ${c.empresa}`, Author: "Veilig", Subject: "Proposta comercial" } });
  doc.registerFont("R", fonte("Regular"));
  doc.registerFont("S", fonte("SemiBold"));
  doc.registerFont("B", fonte("Bold"));
  doc.registerFont("X", fonte("ExtraBold"));

  const partes: Buffer[] = [];
  doc.on("data", (b: Buffer) => partes.push(b));
  const fim = new Promise<Buffer>((ok) => doc.on("end", () => ok(Buffer.concat(partes))));

  const L = doc.page.margins.left;
  const W = doc.page.width - L - doc.page.margins.right;
  const limite = () => doc.page.height - doc.page.margins.bottom;
  const garantir = (h: number) => { if (doc.y + h > limite()) doc.addPage(); };

  // ---- Cabeçalho
  doc.rect(0, 0, doc.page.width, 150).fill(COR.ink);
  const logo = path.join(RAIZ, "public/logo.png");
  if (fs.existsSync(logo)) doc.image(logo, L, 40, { width: 34 });
  doc.font("R").fontSize(15).fillColor(COR.acc).text("V E I L I G", L + 46, 48, { characterSpacing: 2 });
  doc.font("X").fontSize(24).fillColor("#ffffff").text("Proposta comercial", L, 92);
  doc.font("R").fontSize(10).fillColor("#cfe3e8").text(`${c.numero} · ${c.emitida}`, L, 124);

  // ---- Para
  doc.y = 176;
  doc.font("R").fontSize(9).fillColor(COR.muted).text("PARA", L);
  doc.font("B").fontSize(15).fillColor(COR.ink).text(c.empresa, L);
  if (c.contato) doc.font("R").fontSize(10.5).fillColor(COR.muted).text(c.contato, L);
  doc.moveDown(0.8);
  doc.font("R").fontSize(11).fillColor(COR.ink).text(c.intro, L, doc.y, { width: W, lineGap: 3 });
  doc.moveDown(0.6);

  // ---- Seções
  const linha = (k: string, v: string) => {
    doc.font("R").fontSize(10);
    const hK = doc.heightOfString(k, { width: W * 0.55 });
    doc.font("S").fontSize(10);
    const hV = doc.heightOfString(v, { width: W * 0.42 });
    const h = Math.max(hK, hV) + 12;
    garantir(h);
    const y = doc.y;
    doc.font("R").fontSize(10).fillColor(COR.muted).text(k, L, y + 6, { width: W * 0.55 });
    doc.font("S").fontSize(10).fillColor(COR.ink).text(v, L + W * 0.58, y + 6, { width: W * 0.42, align: "right" });
    doc.moveTo(L, y + h).lineTo(L + W, y + h).lineWidth(0.5).strokeColor(COR.line).stroke();
    doc.y = y + h;
  };

  const secao = (s: Secao) => {
    // Seções curtas não se dividem entre páginas.
    const est = 44 + (s.texto ? 20 : 0) + (s.linhas?.length ?? 0) * 26 + (s.destaque ? 50 : 0) + (s.itens?.length ?? 0) * 22
      + (s.tabela ? 30 + s.tabela.linhas.length * 18 : 0) + (s.nota ? 34 : 0);
    garantir(est < 420 ? est : 80);
    doc.moveDown(1.1);
    const y = doc.y;
    doc.rect(L, y + 2, 3, 15).fill(COR.acc);
    doc.font("B").fontSize(13).fillColor(COR.ink).text(s.titulo, L + 12, y, { width: W - 12 });
    doc.moveDown(0.4);
    if (s.texto) { doc.font("R").fontSize(10.5).fillColor(COR.ink).text(s.texto, L, doc.y, { width: W }); doc.moveDown(0.3); }
    for (const [k, v] of s.linhas ?? []) linha(k, v);
    if (s.destaque) {
      const [k, v] = s.destaque;
      garantir(46);
      const yb = doc.y + 8;
      doc.roundedRect(L, yb, W, 38, 6).fill(COR.accSoft);
      doc.font("S").fontSize(10.5).fillColor(COR.ink).text(k, L + 12, yb + 13, { width: W * 0.6 });
      doc.font("X").fontSize(14).fillColor(COR.ink).text(v, L + W * 0.6, yb + 10, { width: W * 0.4 - 12, align: "right" });
      doc.y = yb + 38;
    }
    if (s.itens) {
      doc.moveDown(0.2);
      s.itens.forEach((it, i) => {
        const marcador = s.titulo === "Próximos passos" ? `${i + 1}.` : "•";
        doc.font("R").fontSize(10.5);
        const h = doc.heightOfString(it, { width: W - 18, lineGap: 2 }) + 5;
        garantir(h);
        const y0 = doc.y;
        doc.fillColor(COR.acc).font("B").text(marcador, L, y0, { width: 16 });
        doc.fillColor(COR.ink).font("R").text(it, L + 18, y0, { width: W - 18, lineGap: 2 });
        doc.y = y0 + h;
      });
    }
    if (s.tabela) {
      doc.moveDown(0.6);
      garantir(30);
      const yc = doc.y;
      doc.rect(L, yc, W, 20).fill(COR.soft);
      doc.font("S").fontSize(9).fillColor(COR.muted).text(s.tabela.cab[0], L + 8, yc + 6, { width: W * 0.4 });
      doc.text(s.tabela.cab[1], L + W * 0.4, yc + 6, { width: W * 0.6 - 8, align: "right" });
      doc.y = yc + 20;
      for (const [k, v] of s.tabela.linhas) {
        garantir(18);
        const y = doc.y;
        doc.font("R").fontSize(9.5).fillColor(COR.ink).text(k, L + 8, y + 4, { width: W * 0.4 });
        doc.text(v, L + W * 0.4, y + 4, { width: W * 0.6 - 8, align: "right" });
        doc.moveTo(L, y + 18).lineTo(L + W, y + 18).lineWidth(0.5).strokeColor(COR.line).stroke();
        doc.y = y + 18;
      }
    }
    if (s.nota) {
      doc.moveDown(0.5);
      doc.font("R").fontSize(8.5).fillColor(COR.muted);
      garantir(doc.heightOfString(s.nota, { width: W, lineGap: 1.5 }) + 4);
      doc.text(s.nota, L, doc.y, { width: W, lineGap: 1.5 });
    }
  };

  c.secoes.forEach(secao);

  if (c.observacoes) secao({ titulo: "Observações", texto: c.observacoes });

  // ---- Validade e assinatura
  garantir(120);
  doc.moveDown(1.2);
  const yv = doc.y;
  doc.font("R").fontSize(10);
  const hv = doc.heightOfString(c.condicao, { width: W - 24 }) + 20;
  doc.roundedRect(L, yv, W, hv, 6).lineWidth(1).strokeColor(COR.acc).stroke();
  doc.fillColor(COR.ink).text(c.condicao, L + 12, yv + 10, { width: W - 24 });
  doc.y = yv + hv + 18;
  c.assinatura.forEach((l, i) => doc.font(i === 0 ? "B" : "R").fontSize(i === 0 ? 11 : 9.5).fillColor(i === 0 ? COR.ink : COR.muted).text(l, L));

  // ---- Rodapé em todas as páginas
  const n = doc.bufferedPageRange().count;
  for (let i = 0; i < n; i++) {
    doc.switchToPage(i);
    doc.page.margins.bottom = 0; // escrever no rodapé sem abrir página nova
    const y = doc.page.height - 40;
    doc.font("R").fontSize(8).fillColor(COR.muted)
      .text(`Veilig LTDA · CNPJ 54.490.670/0001-62 · Proposta ${c.numero}`, L, y, { width: W * 0.7, lineBreak: false })
      .text(`${i + 1} de ${n}`, L + W * 0.7, y, { width: W * 0.3, align: "right", lineBreak: false });
  }
  doc.end();
  return fim;
}
