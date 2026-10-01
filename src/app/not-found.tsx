import Link from "next/link";

export default function NotFound() {
  return (
    <div className="erro-page">
      <div className="erro-card">
        <div className="erro-code">404</div>
        <h1>Página não encontrada</h1>
        <p>O endereço que você tentou acessar não existe ou foi movido.</p>
        <Link href="/" className="btn-primary" style={{ display: "inline-block", marginTop: 8 }}>
          Voltar ao início
        </Link>
      </div>
    </div>
  );
}
