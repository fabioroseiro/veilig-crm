"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { BlocoForm } from "@/components/BlocoForm";
import { custoAnualDoPerfil, custoDaRevisao, ocorrenciasNoAno } from "@/lib/custo-plano";
import { cenariosSugeridos } from "@/lib/cenarios-venda";
import { criarPlano, type FormState } from "./actions";

const initial: FormState = { ok: false };

type Modelo = {
  id: string;
  label: string;
  fabricante: string;
  /** Rótulo para exibição ("Moto"). */
  categoria: string;
  /** Valor bruto ("moto"), que escolhe o tom dos cenários de venda sugeridos. */
  categoriaValor?: string;
};

type Grupo = { id: string; nome: string };

type Escopo = "zero" | "seminovo" | "ambos";

export type Beneficio = {
  nome: string;
  descricao: string;
  horasAno: string;
  custoHora: string;
  custoAnoEstimado: string;
};

export type Revisao = {
  nome: string;
  km: string;
  meses: string;
  recorrente: boolean;
  incluiPecas: boolean;
  incluiMaoObra: boolean;
  custoPecas: string;
  custoMaoObra: string;
};

/** "1.234,56" → 1234.56 */
function parseNum(v: string): number {
  const s = String(v ?? "").replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

const estiloPreset: React.CSSProperties = {
  fontSize: 12,
  padding: "3px 10px",
  borderRadius: 6,
  border: "1px solid var(--line)",
  background: "transparent",
  cursor: "pointer",
  color: "var(--ink-soft)",
};

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Serve para CRIAR e para EDITAR. Na edição recebe a action já ligada ao plano
// e os valores atuais; sem isso seria preciso um segundo formulário quase igual,
// que na prática acabaria divergindo deste.
export function PlanoForm({
  modelos,
  grupos,
  action,
  valoresIniciais,
  modelosIniciais,
  revisoesIniciais,
  beneficiosIniciais,
  argumentosIniciais,
  rotuloBotao = "Criar plano",
}: {
  modelos: Modelo[];
  grupos: Grupo[] | null;
  action?: (prev: FormState, fd: FormData) => Promise<FormState>;
  valoresIniciais?: Record<string, string>;
  modelosIniciais?: { id: string; precoMinimo: string; fatorCusto: string }[];
  argumentosIniciais?: { titulo: string; texto: string }[];
  revisoesIniciais?: Revisao[];
  beneficiosIniciais?: Beneficio[];
  rotuloBotao?: string;
}) {
  const [state, formAction, pending] = useActionState(action ?? criarPlano, initial);
  const err = state.errors || {};
  // Depois de um erro, o eco do servidor manda; na primeira carga da edição,
  // valem os valores do banco.
  const val = state.values || valoresIniciais || {};
  // Controlados: com defaultValue, um erro do servidor devolveria o
  // formulário com os campos vazios e a pessoa reescreveria tudo.
  const [descricao, setDescricao] = useState(val.descricao ?? "");
  const [groupId, setGroupId] = useState(val.groupId ?? "");


  const [busca, setBusca] = useState("");
  const [fabFiltro, setFabFiltro] = useState("");
  const [selecionados, setSelecionados] = useState<Set<string>>(
    new Set((modelosIniciais ?? []).map((m) => m.id))
  );

  // Preço mínimo POR MODELO. Era um valor único no plano, mas modelos com
  // custos de manutenção diferentes precisam de pisos diferentes.
  const [precosMinimos, setPrecosMinimos] = useState<Record<string, string>>(() =>
    Object.fromEntries((modelosIniciais ?? []).map((m) => [m.id, m.precoMinimo]))
  );

  // Fator de custo: quanto o modelo custa em relação ao de referência, cujos
  // custos são os cadastrados nas revisões acima.
  const [fatores, setFatores] = useState<Record<string, string>>(() =>
    Object.fromEntries((modelosIniciais ?? []).map((m) => [m.id, m.fatorCusto]))
  );

  const modelosParaEnviar = Array.from(selecionados).map((id) => ({
    id,
    precoMinimo: precosMinimos[id] ?? "",
    fatorCusto: fatores[id] ?? "1,00",
  }));

  const semPrecoMinimo = modelosParaEnviar.filter((m) => parseNum(m.precoMinimo) <= 0);



  // ── Política de aceitação e carência ──────────────────────────────────────
  // Defaults reproduzem o comportamento de hoje: aceita tudo, carência zero.
  const [aceitaZeroKm, setAceitaZeroKm] = useState(
    val.aceitaZeroKm !== undefined ? val.aceitaZeroKm === "on" : true
  );
  const [idadeMax, setIdadeMax] = useState(val.idadeMaximaAnos ?? "99");
  const [cZero, setCZero] = useState(val.carenciaZeroKm ?? "0");
  const [cAte2, setCAte2] = useState(val.carenciaAte2Anos ?? "0");
  const [c3a5, setC3a5] = useState(val.carencia3a5Anos ?? "0");
  const [c6, setC6] = useState(val.carencia6Mais ?? "0");
  const [nome, setNome] = useState(val.nome ?? "");
  const [aAte2, setAAte2] = useState(val.acrescimoAte2Anos ?? "0");
  const [a3a5, setA3a5] = useState(val.acrescimo3a5Anos ?? "0");
  const [a6, setA6] = useState(val.acrescimo6Mais ?? "0");

  // ── Tetos de utilização (vazio = sem limite) ────────────────────────────
  const [limRev, setLimRev] = useState(val.limiteRevisoesAno ?? "");
  const [limPecas, setLimPecas] = useState(val.limiteValorPecasAno ?? "");
  const [limMO, setLimMO] = useState(val.limiteValorMaoObraAno ?? "");
  const [limTotal, setLimTotal] = useState(val.limiteValorTotalAno ?? "");
  const [limKm, setLimKm] = useState(val.limiteKmAno ?? "");
  const [exclusoes, setExclusoes] = useState(val.exclusoes ?? "");

  // ── Cronograma de revisões ──────────────────────────────────────────────
  const [revisoes, setRevisoes] = useState<Revisao[]>(
    revisoesIniciais && revisoesIniciais.length > 0
      ? revisoesIniciais
      : [{ nome: "1ª revisão", km: "", meses: "", recorrente: false, incluiPecas: true, incluiMaoObra: true, custoPecas: "", custoMaoObra: "" }]
  );

  const [beneficios, setBeneficios] = useState<Beneficio[]>(beneficiosIniciais ?? []);
  const [condicoes, setCondicoes] = useState(val.condicoes ?? "");

  // Preço central: o valor do grupo vale para todas as lojas e o plano já
  // nasce vendável.
  const [precoPeloGrupo, setPrecoPeloGrupo] = useState(val.precoPeloGrupo === "on");

  // ── Argumentos de venda ──────────────────────────────────────────────────
  // Editáveis por grupo: o argumento de moto é diferente do de carro, e quem
  // está no balcão conhece a linguagem que funciona.
  const [argumentos, setArgumentos] = useState<{ titulo: string; texto: string }[]>(
    argumentosIniciais ?? []
  );

  const alterarArgumento = (i: number, campo: "titulo" | "texto", v: string) =>
    setArgumentos((as) => as.map((a, idx) => (idx === i ? { ...a, [campo]: v } : a)));

  const usarSugestoes = () => {
    // Categorias dos modelos selecionados definem o tom da sugestão.
    const cats = Array.from(selecionados)
      .map((id) => modelos.find((m) => m.id === id)?.categoriaValor)
      .filter(Boolean) as string[];
    setArgumentos(cenariosSugeridos(cats));
  };

  // Margem desejada, para a sugestão já sair no preço de venda em vez do
  // break-even. Não é salva: é ferramenta de cálculo, não dado do plano.
  const [margem, setMargem] = useState("35");

  const alterarBeneficio = (i: number, campo: keyof Beneficio, valor: string) =>
    setBeneficios((bs) => bs.map((b, idx) => (idx === i ? { ...b, [campo]: valor } : b)));

  const adicionarBeneficio = () =>
    setBeneficios((bs) => [
      ...bs,
      { nome: "", descricao: "", horasAno: "", custoHora: "", custoAnoEstimado: "" },
    ]);

  const removerBeneficio = (i: number) =>
    setBeneficios((bs) => bs.filter((_, idx) => idx !== i));

  // Custo anual de um benefício: se horas e valor da hora estão preenchidos,
  // ele VEM da multiplicação — guardar os dois independentes deixaria os
  // números divergirem na cabeça de quem preenche.
  const custoDoBeneficio = (b: Beneficio): number | null => {
    const h = parseNum(b.horasAno);
    const vh = parseNum(b.custoHora);
    if (b.horasAno.trim() !== "" && b.custoHora.trim() !== "") {
      return Math.round(h * vh * 100) / 100;
    }
    if (b.custoAnoEstimado.trim() !== "") return parseNum(b.custoAnoEstimado);
    return null; // não estimado ≠ de graça
  };

  const alterarRevisao = (i: number, campo: keyof Revisao, valor: any) =>
    setRevisoes((rs) => rs.map((r, idx) => (idx === i ? { ...r, [campo]: valor } : r)));

  const adicionarRevisao = () =>
    setRevisoes((rs) => [
      ...rs,
      { nome: `${rs.length + 1}ª revisão`, km: "", meses: "", recorrente: false, incluiPecas: true, incluiMaoObra: true, custoPecas: "", custoMaoObra: "" },
    ]);

  const removerRevisao = (i: number) => setRevisoes((rs) => rs.filter((_, idx) => idx !== i));

  // ── Espelho de custo da CARTEIRA ────────────────────────────────────────
  //
  // O plano é mutualizado: quem usa muito é bancado por quem usa pouco. Por
  // isso o número que importa é o custo MÉDIO da carteira, não o do caso
  // extremo. Olhar só o pior caso levaria o grupo a precificar como se todo
  // cliente fosse motoboy — encarecendo o plano para todo mundo e derrubando a
  // adesão, que é justamente o que faz a mutualização funcionar.
  //
  // O caso extremo continua visível ao lado, como referência de exposição.
  // Perfis do simulador: km/mês E percentual são EDITÁVEIS.
  //
  // Antes eram fixos, o que embutia a suposição de que toda carteira é mista.
  // Mas o grupo pode criar um plano só para motorista de aplicativo, outro só
  // para particular — e aí a mistura é outra, e o km típico também.
  const [perfis, setPerfis] = useState([
    { chave: "particular", rotulo: "Particular", kmMes: "500", pct: "50" },
    { chave: "comum", rotulo: "Uso comum", kmMes: "1000", pct: "30" },
    { chave: "entregas", rotulo: "Entregas", kmMes: "2000", pct: "15" },
    { chave: "aplicativo", rotulo: "Aplicativo", kmMes: "3000", pct: "5" },
  ]);

  const alterarPerfil = (i: number, campo: "kmMes" | "pct", valor: string) =>
    setPerfis((ps) => ps.map((p, idx) => (idx === i ? { ...p, [campo]: valor } : p)));

  /** Concentra a carteira num perfil só — para planos feitos sob medida. */
  const aplicarPreset = (chave: string | null) =>
    setPerfis((ps) =>
      ps.map((p) => ({
        ...p,
        pct: chave === null
          ? { particular: "50", comum: "30", entregas: "15", aplicativo: "5" }[p.chave] ?? "0"
          : p.chave === chave
          ? "100"
          : "0",
      }))
    );

  // Custo de um cliente daquele perfil no primeiro ano.
  // O cálculo vive em src/lib/custo-plano.ts, testado à parte: recorrência com
  // "o que vier primeiro" é onde erro passa despercebido.
  const custoDoPerfil = (kmMes: number) => {
    const revs = revisoes.map((r) => ({
      km: r.km.trim() === "" ? null : Number(r.km.replace(/\D/g, "")),
      meses: r.meses.trim() === "" ? null : Number(r.meses.replace(/\D/g, "")),
      recorrente: r.recorrente,
      incluiPecas: r.incluiPecas,
      incluiMaoObra: r.incluiMaoObra,
      custoPecas: parseNum(r.custoPecas),
      custoMaoObra: parseNum(r.custoMaoObra),
    }));
    const bens = beneficios.map((b) => ({
      nome: b.nome,
      custoAnoEstimado: custoDoBeneficio(b),
    }));
    const c = custoAnualDoPerfil(revs, bens, kmMes);
    return { total: c.total, quantas: c.revisoes, custoRevisoes: c.custoRevisoes, custoBeneficios: c.custoBeneficios };
  };

  const semEstimativa = beneficios
    .filter((b) => custoDoBeneficio(b) === null)
    .map((b) => b.nome || "(sem nome)");

  const carteira = useMemo(() => {
    const linhas = perfis.map((p) => {
      const pct = Number(String(p.pct).replace(/\D/g, "")) || 0;
      const kmMes = Number(String(p.kmMes).replace(/\D/g, "")) || 0;
      return { ...p, pct, kmMesNum: kmMes, ...custoDoPerfil(kmMes) };
    });
    const somaPct = linhas.reduce((a, l) => a + l.pct, 0);
    const medio =
      somaPct > 0 ? linhas.reduce((a, l) => a + l.total * (l.pct / somaPct), 0) : 0;
    // "Maior uso" só conta perfis que existem na carteira: num plano só para
    // aplicativo, o particular não é exposição nenhuma — ninguém daquele
    // perfil vai comprar.
    const pior = linhas.filter((l) => l.pct > 0).reduce((a, l) => Math.max(a, l.total), 0);

    // Perfil único = SEM mutualização. O preço precisa cobrir aquele perfil
    // sozinho, porque não há cliente leve para bancar o pesado.
    const dominante = linhas.find((l) => somaPct > 0 && l.pct / somaPct >= 0.8);
    return { linhas, somaPct, medio, pior, dominante };
  }, [revisoes, beneficios, perfis]);

  /**
   * Custo mensal estimado de um modelo = custo médio da carteira (que é do
   * modelo de referência) × fator ÷ 12.
   *
   * É o PISO de break-even: abaixo disso a loja perde dinheiro em cada venda.
   * Não inclui o fee da Veilig nem impostos — a tela diz isso, para ninguém
   * confundir break-even com preço saudável.
   */
  const custoMensalDoModelo = (id: string): number => {
    const fator = parseNum(fatores[id] ?? "1") || 1;
    return Math.round((carteira.medio * fator / 12) * 100) / 100;
  };

  /**
   * Preço sugerido = valor avulso × (1 + acréscimo).
   *
   * É ACRÉSCIMO (markup), não margem: soma o percentual sobre a base, que é
   * como se pensa no balcão ("aumentar 10%"). A versão anterior dividia por
   * (1 − margem), o sentido contábil de margem — matematicamente válido, mas
   * não era o que a palavra sugeria para quem preenche, e 10% virava 162,97
   * em vez de 161,34.
   *
   * A base já é o preço COBRADO, que embute a margem da loja. Então isto é
   * acréscimo sobre margem — funciona como colchão de risco, mas empurra o
   * plano para cima do avulso. Por isso o valor avulso fica visível ao lado.
   */
  const precoSugerido = (id: string): number => {
    const avulso = custoMensalDoModelo(id);
    const acresc = parseNum(margem) / 100;
    if (avulso <= 0 || acresc < 0) return 0;
    return Math.round(avulso * (1 + acresc) * 100) / 100;
  };

  // Mínimo abaixo do custo é o erro que a calculadora existe para evitar.
  // Não bloqueia o salvamento — o grupo pode ter razão para subsidiar um
  // modelo — mas não deixa passar despercebido.
  const abaixoDoCusto = modelosParaEnviar
    .map((m) => ({
      ...m,
      label: modelos.find((x) => x.id === m.id)?.label ?? "",
      custo: custoMensalDoModelo(m.id),
    }))
    .filter((m) => parseNum(m.precoMinimo) > 0 && parseNum(m.precoMinimo) < m.custo);

  const soNum = (v: string) => v.replace(/\D/g, "").slice(0, 2);

  // ── Escopo do plano ──────────────────────────────────────────────────────
  // No banco continuam existindo dois campos (aceitaZeroKm e idadeMaximaAnos).
  // Aqui eles viram uma escolha só, porque a combinação "aceita zero km +
  // idade máxima 0" é uma forma obscura de dizer "apenas zero km" — quem
  // preenche não tem por que deduzir isso.
  const escopoInicial: Escopo = !aceitaZeroKm
    ? "seminovo"
    : Number(idadeMax || 0) === 0
    ? "zero"
    : "ambos";
  const [escopo, setEscopo] = useState<Escopo>(escopoInicial);

  const mudarEscopo = (novo: Escopo) => {
    setEscopo(novo);
    if (novo === "zero") {
      setAceitaZeroKm(true);
      setIdadeMax("0");
    } else if (novo === "seminovo") {
      setAceitaZeroKm(false);
      // sair de "apenas zero km" deixaria a idade em 0, o que não aceitaria
      // veículo nenhum — devolve o padrão de "sem limite"
      if (Number(idadeMax || 0) === 0) setIdadeMax("99");
    } else {
      setAceitaZeroKm(true);
      if (Number(idadeMax || 0) === 0) setIdadeMax("99");
    }
  };
  const soPct = (v: string) => v.replace(/[^\d,]/g, "").slice(0, 6);

  // ── Blocos recolhíveis ───────────────────────────────────────────────────
  // Quais campos pertencem a cada bloco. Serve para abrir automaticamente o
  // bloco que tem erro: sem isso, a pessoa lê "Verifique os campos" e não acha
  // onde, porque o campo está escondido num bloco fechado.
  const CAMPOS_DO_BLOCO = {
    dados: ["groupId", "nome", "descricao"],
    veiculos: [
      "aceitaZeroKm", "idadeMaximaAnos", "carenciaZeroKm", "carenciaAte2Anos",
      "carencia3a5Anos", "carencia6Mais", "acrescimoAte2Anos",
      "acrescimo3a5Anos", "acrescimo6Mais",
    ],
    cobertura: ["revisoes"],
    tetos: [
      "limiteRevisoesAno", "limiteKmAno", "limiteValorPecasAno",
      "limiteValorMaoObraAno", "limiteValorTotalAno", "exclusoes",
    ],
    modelos: ["modelos"],
  } as const;

  const temErroEm = (chave: keyof typeof CAMPOS_DO_BLOCO) =>
    CAMPOS_DO_BLOCO[chave].some((c) => !!err[c]);

  const errosDados = temErroEm("dados");
  const errosVeiculos = temErroEm("veiculos");
  const errosCobertura = temErroEm("cobertura");
  const errosTetos = temErroEm("tetos");
  const errosModelos = temErroEm("modelos");

  // Ao criar, o primeiro bloco já vem aberto (é por onde se começa).
  // Ao editar, tudo fechado: quem edita costuma ir mexer numa coisa só.
  const editando = !!valoresIniciais;
  const [abertos, setAbertos] = useState({
    dados: !editando,
    veiculos: false,
    cobertura: false,
    tetos: false,
    modelos: false,
  });

  const alternar = (chave: keyof typeof abertos) =>
    setAbertos((a) => ({ ...a, [chave]: !a[chave] }));

  // Depois de um envio recusado, abre os blocos que têm erro.
  useEffect(() => {
    if (!state.errors) return;
    setAbertos((a) => ({
      dados: a.dados || errosDados,
      veiculos: a.veiculos || errosVeiculos,
      cobertura: a.cobertura || errosCobertura,
      tetos: a.tetos || errosTetos,
      modelos: a.modelos || errosModelos,
    }));
  }, [state.errors, errosDados, errosVeiculos, errosCobertura, errosTetos, errosModelos]);


  // Mostra o efeito em dinheiro do percentual, para o lojista não ter que
  // fazer a conta de cabeça enquanto decide.
  const exemploPreco = (pct: string) => {
    const n = Number(String(pct).replace(",", ".")) || 0;
    if (n === 0) return "Mesmo preço do veículo novo.";
    const final = Math.round(100 * (1 + n / 100) * 100) / 100;
    return `Plano de R$ 100,00 vira R$ ${final.toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}.`;
  };
  const idadeMaxNum = Number(idadeMax || 0);

  // ── Resumos dos cabeçalhos ───────────────────────────────────────────────
  // Fechado não pode significar invisível.
  // O preço mínimo agora vive em cada modelo — o bloco de dados só tem
  // identificação.
  const resumoDados = nome.trim() ? nome.trim() : "sem nome";

  const resumoVeiculos = (() => {
    const limite = idadeMaxNum >= 99 ? "sem limite de idade" : `até ${idadeMaxNum} anos`;
    if (escopo === "zero") return "apenas zero km";
    if (escopo === "seminovo") return `apenas seminovo · ${limite}`;
    return `zero km e seminovo · ${limite}`;
  })();

  const resumoCobertura =
    revisoes.length === 0
      ? "nenhuma revisão"
      : (() => {
          // "1 revisão" contava LINHAS, não ocorrências: um plano com uma linha
          // recorrente a cada 6.000 km mostrava "1 revisão", quando na verdade
          // são várias por ano. Dizer "periódicas" evita a leitura errada.
          const temRecorrente = revisoes.some((r) => r.recorrente);
          const n = revisoes.length;
          const qtd = temRecorrente
            ? `${n} ${n === 1 ? "linha" : "linhas"} (com revisões periódicas)`
            : `${n} ${n === 1 ? "revisão" : "revisões"}`;
          return `${qtd} · média R$ ${brl(carteira.medio / 12)}/mês`;
        })();

  const resumoTetos = (() => {
    const n = [limRev, limKm, limPecas, limMO, limTotal].filter((v) => String(v).trim() !== "").length;
    return n === 0 ? "sem limites" : `${n} ${n === 1 ? "limite" : "limites"}`;
  })();

  const resumoModelos = (() => {
    if (selecionados.size === 0) return "nenhum selecionado";
    const valores = modelosParaEnviar.map((m) => parseNum(m.precoMinimo)).filter((n) => n > 0);
    const qtd = `${selecionados.size} ${selecionados.size === 1 ? "modelo" : "modelos"}`;
    if (valores.length === 0) return `${qtd} · sem preço mínimo`;
    const min = Math.min(...valores);
    const max = Math.max(...valores);
    return min === max
      ? `${qtd} · mín. R$ ${brl(min)}`
      : `${qtd} · mín. R$ ${brl(min)} a R$ ${brl(max)}`;
  })();
  const soValor = (v: string) => v.replace(/[^\d,]/g, "").slice(0, 12);

  // minIdade serve para avisar quando uma faixa nunca vai acontecer, porque
  // está acima do limite de idade que o plano aceita.
  const FAIXAS = [
    {
      name: "carenciaAte2Anos",
      rotulo: "0 a 2 anos",
      minIdade: 0,
      valor: cAte2,
      set: setCAte2,
      nomeAcrescimo: "acrescimoAte2Anos",
      acrescimo: aAte2,
      setAcrescimo: setAAte2,
      dica: "Seminovo recente, risco menor.",
    },
    {
      name: "carencia3a5Anos",
      rotulo: "3 a 5 anos",
      minIdade: 3,
      valor: c3a5,
      set: setC3a5,
      nomeAcrescimo: "acrescimo3a5Anos",
      acrescimo: a3a5,
      setAcrescimo: setA3a5,
      dica: "Risco intermediário.",
    },
    {
      name: "carencia6Mais",
      rotulo: "6 anos ou mais",
      minIdade: 6,
      valor: c6,
      set: setC6,
      nomeAcrescimo: "acrescimo6Mais",
      acrescimo: a6,
      setAcrescimo: setA6,
      dica: "Maior risco, carência maior.",
    },
  ];

  // fabricantes distintos entre os modelos disponíveis
  const fabricantesDisponiveis = useMemo(
    () => Array.from(new Set(modelos.map((m) => m.fabricante))).sort(),
    [modelos]
  );

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return modelos.filter((m) => {
      const casaBusca = !q || m.label.toLowerCase().includes(q);
      const casaFab = !fabFiltro || m.fabricante === fabFiltro;
      return casaBusca && casaFab;
    });
  }, [busca, fabFiltro, modelos]);

  const toggle = (id: string) => {
    setSelecionados((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const marcarTodosFiltrados = () => {
    setSelecionados((prev) => {
      const n = new Set(prev);
      filtrados.forEach((m) => n.add(m.id));
      return n;
    });
  };

  const limpar = () => setSelecionados(new Set());

  return (
    <form action={formAction}>
      {state.message && !state.ok && (
        <div className="banner banner-error">{state.message}</div>
      )}

      <BlocoForm
        titulo={"Dados do plano"}
        resumo={resumoDados}
        aberto={abertos.dados}
        onToggle={() => alternar("dados")}
        temErro={errosDados}
        opcional={false}
      >
      {grupos && (
        <div className="grid" style={{ marginBottom: 4 }}>
          <div className={err.groupId ? "field has-error col-2" : "field col-2"}>
            <label htmlFor="groupId">Grupo</label>
            <select id="groupId" name="groupId" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
              <option value="" disabled>
                Selecione o grupo…
              </option>
              {grupos.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.nome}
                </option>
              ))}
            </select>
            {err.groupId ? (
              <span className="error">{err.groupId}</span>
            ) : (
              <span className="hint">
                Como Veilig, escolha para qual grupo este plano será criado.
              </span>
            )}
          </div>
        </div>
      )}
      <div className="grid">
        <div className={err.nome ? "field has-error col-1" : "field col-1"}>
          <label htmlFor="nome">Nome do plano</label>
          <input id="nome" name="nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Revisão Essencial" />
          {err.nome && <span className="error">{err.nome}</span>}
        </div>
        <div className="field col-2">
          <label htmlFor="descricao">Descrição</label>
          <textarea
            id="descricao"
            name="descricao" value={descricao} onChange={(e) => setDescricao(e.target.value)}
            rows={3}
            placeholder="O que o plano cobre: revisões, troca de óleo, filtros…"
          />
        </div>
      </div>
      </BlocoForm>

      <BlocoForm
        titulo={"Quais veículos este plano aceita"}
        resumo={resumoVeiculos}
        aberto={abertos.veiculos}
        onToggle={() => alternar("veiculos")}
        temErro={errosVeiculos}
        opcional={false}
      >
      <p className="hint" style={{ marginTop: 0, marginBottom: 12 }}>
        A <strong>carência</strong> é o período em que o cliente já paga, mas
        ainda não pode usar o plano. Ela protege contra quem assina na véspera
        de uma revisão que já ia precisar — não limita quem já está dentro.
        Veículo mais velho costuma chegar mais perto da próxima revisão, por
        isso a carência costuma crescer com a idade.
      </p>
      {err.aceitaZeroKm && (
        <div className="banner banner-error">{err.aceitaZeroKm}</div>
      )}

      {/* Escopo em três opções em vez de "aceita zero km?" + "idade máxima".
          Os dois campos antigos expressavam as mesmas combinações, mas exigiam
          que a pessoa deduzisse que "aceita zero km + idade máxima 0" queria
          dizer "apenas zero km". No banco continuam sendo os mesmos dois
          campos — a mudança é só de leitura. */}
      <div className="field">
        <label>Este plano é para</label>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
          {[
            {
              valor: "zero",
              titulo: "Apenas veículos zero km",
              dica: "Vendido junto com o veículo novo, sem histórico desconhecido.",
            },
            {
              valor: "seminovo",
              titulo: "Apenas veículos seminovos",
              dica: "Para quem chega com um veículo usado. O zero km não é aceito.",
            },
            {
              valor: "ambos",
              titulo: "Zero km e seminovos",
              dica: "Um plano só, com carência e preço variando pela idade.",
            },
          ].map((op) => (
            <label
              key={op.valor}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                cursor: "pointer",
                border: `1px solid ${escopo === op.valor ? "var(--accent)" : "var(--line)"}`,
                background: escopo === op.valor ? "rgba(78,195,224,0.08)" : undefined,
                borderRadius: 8,
                padding: "10px 12px",
              }}
            >
              <input
                type="radio"
                name="escopoVeiculo"
                value={op.valor}
                checked={escopo === op.valor}
                onChange={() => mudarEscopo(op.valor as Escopo)}
                style={{ width: "auto", margin: "3px 0 0 0" }}
              />
              <span>
                <span style={{ fontWeight: 600 }}>{op.titulo}</span>
                <br />
                <span className="hint">{op.dica}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* O checkbox virou campo oculto: a action continua lendo o mesmo nome. */}
      {aceitaZeroKm && <input type="hidden" name="aceitaZeroKm" value="on" />}
      <input type="hidden" name="idadeMaximaAnos" value={idadeMax} />

      <div className="grid">
        {aceitaZeroKm && (
          <div className={err.carenciaZeroKm ? "field has-error col-1" : "field col-1"}>
            <label htmlFor="carenciaZeroKm">Carência do zero km (meses)</label>
            <input
              id="carenciaZeroKm"
              name="carenciaZeroKm"
              inputMode="numeric"
              value={cZero}
              onChange={(e) => setCZero(soNum(e.target.value))}
              placeholder="0"
            />
            {err.carenciaZeroKm ? (
              <span className="error">{err.carenciaZeroKm}</span>
            ) : (
              <span className="hint">Normalmente 0 — o veículo é novo.</span>
            )}
          </div>
        )}

        {escopo !== "zero" && (
          <div className={err.idadeMaximaAnos ? "field has-error col-1" : "field col-1"}>
            <label htmlFor="idadeMaximaAnosVisivel">Idade máxima do seminovo (anos)</label>
            <input
              id="idadeMaximaAnosVisivel"
              inputMode="numeric"
              value={idadeMax}
              onChange={(e) => setIdadeMax(soNum(e.target.value))}
              placeholder="99"
            />
            {err.idadeMaximaAnos ? (
              <span className="error">{err.idadeMaximaAnos}</span>
            ) : (
              <span className="hint">
                Acima disso, a venda é bloqueada. <strong>99</strong> = sem limite.
              </span>
            )}
          </div>
        )}
      </div>

      {idadeMaxNum > 0 && (
        <>
          <p className="hint" style={{ marginBottom: 8 }}>
            Para cada faixa de idade do seminovo, defina a <strong>carência</strong>{" "}
            (quanto tempo até poder usar) e o <strong>acréscimo</strong> sobre o
            preço. O preço que a loja cadastra é o do <strong>veículo novo</strong>;
            o acréscimo é somado na venda conforme a idade do veículo do cliente.
          </p>
          {FAIXAS.map((f) => {
            const foraDoLimite = f.minIdade > idadeMaxNum;
            return (
              <div
                key={f.name}
                style={{
                  border: "1px solid var(--line)",
                  borderRadius: 8,
                  padding: "12px 14px",
                  marginBottom: 10,
                  opacity: foraDoLimite ? 0.5 : 1,
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: 8 }}>
                  {f.rotulo}
                  {foraDoLimite && (
                    <span className="hint" style={{ fontWeight: 400, marginLeft: 8 }}>
                      não será usada: o limite é {idadeMaxNum} anos
                    </span>
                  )}
                </div>
                <div className="grid">
                  <div className={err[f.name] ? "field has-error col-1" : "field col-1"}>
                    <label htmlFor={f.name}>Carência (meses)</label>
                    <input
                      id={f.name}
                      name={f.name}
                      inputMode="numeric"
                      value={f.valor}
                      onChange={(e) => f.set(soNum(e.target.value))}
                      placeholder="0"
                    />
                    {err[f.name] ? (
                      <span className="error">{err[f.name]}</span>
                    ) : (
                      <span className="hint">{f.dica}</span>
                    )}
                  </div>
                  <div
                    className={
                      err[f.nomeAcrescimo] ? "field has-error col-1" : "field col-1"
                    }
                  >
                    <label htmlFor={f.nomeAcrescimo}>Acréscimo no preço (%)</label>
                    <input
                      id={f.nomeAcrescimo}
                      name={f.nomeAcrescimo}
                      inputMode="decimal"
                      value={f.acrescimo}
                      onChange={(e) => f.setAcrescimo(soPct(e.target.value))}
                      placeholder="0"
                    />
                    {err[f.nomeAcrescimo] ? (
                      <span className="error">{err[f.nomeAcrescimo]}</span>
                    ) : (
                      <span className="hint">
                        {exemploPreco(f.acrescimo)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </>
      )}

      {!aceitaZeroKm && idadeMaxNum === 0 && (
        <div className="banner banner-error">
          Do jeito atual este plano não aceita nenhum veículo. Marque
          &quot;aceita zero km&quot; ou defina uma idade máxima maior que 0.
        </div>
      )}
      </BlocoForm>

      <BlocoForm
        titulo={"O que este plano cobre"}
        resumo={resumoCobertura}
        aberto={abertos.cobertura}
        onToggle={() => alternar("cobertura")}
        temErro={errosCobertura}
        opcional={false}
      >
      <p className="hint" style={{ marginTop: 0, marginBottom: 12 }}>
        Liste as revisões incluídas. O <strong>km é acumulado no odômetro</strong>{" "}
        (1.000, 5.000, 10.000…), como na tabela de fábrica; o prazo conta da
        venda. Preenchendo os dois, vale <strong>o que vier primeiro</strong> —
        é o padrão de fábrica, e é o que faz o cliente que roda mais voltar mais
        vezes à loja.
        <br />
        Informe o <strong>preço médio que a loja cobra hoje</strong> por UMA
        revisão — o valor de tabela, que já inclui a margem dela. Não some o
        ciclo nem o ano: o sistema multiplica pelas ocorrências.
      </p>
      {err.revisoes && <div className="banner banner-error">{err.revisoes}</div>}

      {revisoes.map((r, i) => (
        <div
          key={i}
          style={{
            border: "1px solid var(--line)",
            borderRadius: 8,
            padding: "12px 14px",
            marginBottom: 10,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <input
              value={r.nome}
              onChange={(e) => alterarRevisao(i, "nome", e.target.value)}
              placeholder={r.recorrente ? "Revisões periódicas" : `${i + 1}ª revisão`}
              style={{ fontWeight: 600, maxWidth: 240 }}
              aria-label="Nome da revisão"
            />
            {/* Dá para remover até a última: um plano pode não ter cronograma
                cadastrado ainda, e travar isso impediria de salvar. */}
            <button
              type="button"
              className="btn-ghost"
              style={{ padding: "4px 10px", fontSize: 13 }}
              onClick={() => removerRevisao(i)}
            >
              Remover
            </button>
          </div>
          <label
            style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginBottom: 10 }}
          >
            <input
              type="checkbox"
              checked={r.recorrente}
              onChange={(e) => {
                const marcou = e.target.checked;
                alterarRevisao(i, "recorrente", marcou);
                // O nome automático é ordinal ("1ª revisão"), o que CONTRADIZ
                // uma linha recorrente: o contrato sairia dizendo "1ª revisão:
                // a cada 6.000 km, enquanto vigente" — e quem lê entende que só
                // a primeira está coberta. Só troca se o nome ainda for o
                // padrão; nome escrito pelo usuário é preservado.
                const ehPadrao =
                  r.nome.trim() === "" ||
                  /^\d+ª revisão$/.test(r.nome.trim()) ||
                  r.nome.trim() === "Revisões periódicas";
                if (ehPadrao) {
                  alterarRevisao(i, "nome", marcou ? "Revisões periódicas" : `${i + 1}ª revisão`);
                }
              }}
              style={{ width: "auto", margin: 0 }}
            />
            <span>
              Repete enquanto o cliente pagar
              <span className="hint" style={{ marginLeft: 6 }}>
                {r.recorrente
                  ? "os valores abaixo são o INTERVALO entre revisões"
                  : "acontece uma vez, no km/prazo indicado"}
              </span>
            </span>
          </label>

          <div className="grid">
            <div className="field col-1">
              <label>{r.recorrente ? "A cada quantos km" : "Km acumulado"}</label>
              <input
                inputMode="numeric"
                value={r.km}
                onChange={(e) => alterarRevisao(i, "km", e.target.value.replace(/\D/g, "").slice(0, 7))}
                placeholder="10000"
              />
              <span className="hint">
                {r.recorrente ? "Ex.: 5000 = a cada 5.000 km." : "Em branco = só por prazo."}
              </span>
            </div>
            <div className="field col-1">
              <label>{r.recorrente ? "Ou a cada quantos meses" : "Prazo (meses)"}</label>
              <input
                inputMode="numeric"
                value={r.meses}
                onChange={(e) => alterarRevisao(i, "meses", e.target.value.replace(/\D/g, "").slice(0, 3))}
                placeholder="12"
              />
              <span className="hint">
                {r.recorrente
                  ? "Vale o que vier primeiro: km ou prazo."
                  : "Em branco = só por km."}
              </span>
            </div>
            <div className="field col-1">
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={r.incluiPecas}
                  onChange={(e) => alterarRevisao(i, "incluiPecas", e.target.checked)}
                  style={{ width: "auto", margin: 0 }}
                />
                <span>Cobre peças</span>
              </label>
              <label
                htmlFor={`custoPecas-${i}`}
                style={{ display: "block", marginTop: 6, fontSize: 13, color: "var(--ink-soft)" }}
              >
                Preço médio cobrado (peças)
              </label>
              <input
                id={`custoPecas-${i}`}
                inputMode="decimal"
                value={r.custoPecas}
                onChange={(e) => alterarRevisao(i, "custoPecas", soValor(e.target.value))}
                placeholder="0,00"
                disabled={!r.incluiPecas}
                style={{ marginTop: 2 }}
                aria-label="Preço médio cobrado por revisão (peças)"
              />
              <span className="hint">O que a loja cobra hoje, por revisão.</span>
            </div>
            <div className="field col-1">
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={r.incluiMaoObra}
                  onChange={(e) => alterarRevisao(i, "incluiMaoObra", e.target.checked)}
                  style={{ width: "auto", margin: 0 }}
                />
                <span>Cobre mão de obra</span>
              </label>
              <label
                htmlFor={`custoMaoObra-${i}`}
                style={{ display: "block", marginTop: 6, fontSize: 13, color: "var(--ink-soft)" }}
              >
                Preço médio cobrado (mão de obra)
              </label>
              <input
                id={`custoMaoObra-${i}`}
                inputMode="decimal"
                value={r.custoMaoObra}
                onChange={(e) => alterarRevisao(i, "custoMaoObra", soValor(e.target.value))}
                placeholder="0,00"
                disabled={!r.incluiMaoObra}
                style={{ marginTop: 2 }}
                aria-label="Preço médio cobrado por revisão (mão de obra)"
              />
              <span className="hint">O que a loja cobra hoje, por revisão.</span>
            </div>
          </div>

          {/* A conta se formando na frente de quem preenche. Vendo o resultado,
              fica difícil cadastrar o valor do ANO no campo por engano — que é
              o erro natural quando a linha é recorrente. */}
          {(() => {
            const semGatilho =
              r.km.trim() === "" && r.meses.trim() === "";
            const rc = {
              km: r.km.trim() === "" ? null : Number(r.km.replace(/\D/g, "")),
              meses: r.meses.trim() === "" ? null : Number(r.meses.replace(/\D/g, "")),
              recorrente: r.recorrente,
              incluiPecas: r.incluiPecas,
              incluiMaoObra: r.incluiMaoObra,
              custoPecas: parseNum(r.custoPecas),
              custoMaoObra: parseNum(r.custoMaoObra),
            };
            const porVez = custoDaRevisao(rc);
            if (porVez === 0 && !rc.km && !rc.meses) return null;
            const kmRef = 1000; // perfil de uso comum
            const vezes = ocorrenciasNoAno(rc, kmRef);
            if (semGatilho) {
              // Revisão sem km e sem prazo não diz QUANDO acontece. O contrato
              // sairia dizendo "cobre peças e mão de obra" sem periodicidade —
              // e o cliente não teria como saber a que tem direito.
              return (
                <div
                  className="hint"
                  style={{
                    marginTop: 8,
                    paddingTop: 8,
                    borderTop: "1px dashed var(--line)",
                    color: "var(--danger)",
                  }}
                >
                  <strong>Falta dizer quando esta revisão acontece.</strong>{" "}
                  Preencha o km, o prazo em meses, ou os dois. Sem isso o
                  contrato não consegue descrever a que o cliente tem direito.
                </div>
              );
            }

            return (
              <div className="hint" style={{ marginTop: 8, paddingTop: 8, borderTop: "1px dashed var(--line)" }}>
                <strong>R$ {brl(porVez)} por passagem.</strong>{" "}
                {r.recorrente ? (
                  <>
                    Quem roda 1.000 km/mês tem <strong>{vezes}</strong>{" "}
                    {vezes === 1 ? "revisão" : "revisões"} no ano ={" "}
                    <strong>R$ {brl(porVez * vezes)}</strong>.
                  </>
                ) : vezes > 0 ? (
                  <>Acontece uma vez, dentro do primeiro ano para esse perfil.</>
                ) : (
                  <>Para quem roda 1.000 km/mês, não chega a acontecer no 1º ano.</>
                )}
              </div>
            );
          })()}
        </div>
      ))}

      {revisoes.length === 0 && (
        <p className="hint" style={{ marginTop: 0 }}>
          Nenhuma revisão cadastrada. O plano continua vendável, mas não declara
          o que entrega — e sem isso não dá para dimensionar a carteira abaixo.
        </p>
      )}

      <button
        type="button"
        className="btn-ghost"
        style={{ padding: "6px 14px", fontSize: 13, marginBottom: 14 }}
        onClick={adicionarRevisao}
      >
        + Adicionar revisão
      </button>

      {/* ── Benefícios que não são revisão ── */}
      <div style={{ fontWeight: 600, margin: "18px 0 6px" }}>
        Outros benefícios do plano
      </div>
      <p className="hint" style={{ marginTop: 0, marginBottom: 12 }}>
        Vantagens que não têm km nem periodicidade. A mais comum é{" "}
        <strong>mão de obra grátis em manutenções avulsas</strong> — é ela que
        traz o cliente de volta fora do calendário de revisões: ele vem trocar
        um pneu e compra o pneu aqui.
        <br />
        Para dimensionar, estime <strong>quantas horas por ano</strong> e o{" "}
        <strong>valor da hora</strong> que a loja cobra.
      </p>
      {err.beneficios && <div className="banner banner-error">{err.beneficios}</div>}

      {beneficios.map((b, i) => {
        const custo = custoDoBeneficio(b);
        const porHoras = b.horasAno.trim() !== "" && b.custoHora.trim() !== "";
        return (
          <div
            key={i}
            style={{ border: "1px solid var(--line)", borderRadius: 8, padding: "12px 14px", marginBottom: 10 }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 8 }}>
              <input
                value={b.nome}
                onChange={(e) => alterarBeneficio(i, "nome", e.target.value)}
                placeholder="Ex.: Mão de obra grátis em manutenções avulsas"
                style={{ fontWeight: 600, flex: 1 }}
                aria-label="Nome do benefício"
              />
              <button
                type="button"
                className="btn-ghost"
                style={{ padding: "4px 10px", fontSize: 13 }}
                onClick={() => removerBeneficio(i)}
              >
                Remover
              </button>
            </div>

            <div className="field" style={{ marginBottom: 8 }}>
              <input
                value={b.descricao}
                onChange={(e) => alterarBeneficio(i, "descricao", e.target.value)}
                placeholder="Descrição (opcional) — aparece no contrato"
                aria-label="Descrição do benefício"
              />
            </div>

            <div className="grid">
              <div className="field col-1">
                <label>Horas por ano (estimativa)</label>
                <input
                  inputMode="decimal"
                  value={b.horasAno}
                  onChange={(e) => alterarBeneficio(i, "horasAno", soValor(e.target.value))}
                  placeholder="4"
                />
              </div>
              <div className="field col-1">
                <label>Valor da hora (R$)</label>
                <input
                  inputMode="decimal"
                  value={b.custoHora}
                  onChange={(e) => alterarBeneficio(i, "custoHora", soValor(e.target.value))}
                  placeholder="120,00"
                />
              </div>
              <div className="field col-1">
                <label>Ou valor anual direto (R$)</label>
                <input
                  inputMode="decimal"
                  value={porHoras ? "" : b.custoAnoEstimado}
                  onChange={(e) => alterarBeneficio(i, "custoAnoEstimado", soValor(e.target.value))}
                  placeholder="0,00"
                  disabled={porHoras}
                  style={porHoras ? { background: "var(--bg-soft, #f3f4f6)" } : undefined}
                />
                <span className="hint">
                  {porHoras
                    ? `Calculado: R$ ${brl(custo ?? 0)}/ano`
                    : "Para benefícios que não são por hora."}
                </span>
              </div>
            </div>
          </div>
        );
      })}

      <button
        type="button"
        className="btn-ghost"
        style={{ padding: "6px 14px", fontSize: 13, marginBottom: 14 }}
        onClick={adicionarBeneficio}
      >
        + Adicionar benefício
      </button>

      {/* Espelho da CARTEIRA. O plano é mutualizado — quem usa pouco banca quem
          usa muito — então o número que orienta o preço é o custo médio, não o
          do caso extremo. */}
      <div
        style={{
          background: "rgba(78,195,224,0.12)",
          border: "1px solid rgba(78,195,224,0.5)",
          borderRadius: 8,
          padding: "12px 14px",
          marginBottom: 16,
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: 6 }}>
          Valor avulso da carteira, no primeiro ano
        </div>
        <p className="hint" style={{ marginTop: 0, marginBottom: 10 }}>
          <strong>Para quem é este plano?</strong> Ajuste os percentuais e o
          km/mês típico de cada perfil. Num plano feito sob medida — só para
          motorista de aplicativo, por exemplo — concentre tudo num perfil só.
        </p>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
          <span className="store-sub" style={{ fontSize: 12, alignSelf: "center" }}>
            Atalhos:
          </span>
          <button type="button" onClick={() => aplicarPreset(null)} style={estiloPreset}>
            carteira mista
          </button>
          {perfis.map((p) => (
            <button
              key={p.chave}
              type="button"
              onClick={() => aplicarPreset(p.chave)}
              style={estiloPreset}
            >
              só {p.rotulo.toLowerCase()}
            </button>
          ))}
        </div>

        <table className="list" style={{ marginBottom: 10 }}>
          <thead>
            <tr>
              <th>Perfil</th>
              <th>Km/mês</th>
              <th>% da carteira</th>
              <th>Revisões/ano</th>
              <th>Avulso/ano</th>
            </tr>
          </thead>
          <tbody>
            {carteira.linhas.map((l, i) => (
              <tr key={l.chave} style={l.pct === 0 ? { opacity: 0.45 } : undefined}>
                <td>{l.rotulo}</td>
                <td>
                  <input
                    inputMode="numeric"
                    value={l.kmMes}
                    onChange={(e) =>
                      alterarPerfil(i, "kmMes", e.target.value.replace(/\D/g, "").slice(0, 6))
                    }
                    style={{ width: 80 }}
                    aria-label={`Km por mês de ${l.rotulo}`}
                  />
                </td>
                <td>
                  <input
                    inputMode="numeric"
                    value={l.pct}
                    onChange={(e) =>
                      alterarPerfil(i, "pct", e.target.value.replace(/\D/g, "").slice(0, 3))
                    }
                    style={{ width: 70, opacity: l.pct === 0 ? 0.5 : 1 }}
                    aria-label={`Percentual de ${l.rotulo}`}
                  />
                </td>
                <td className="store-sub">{l.quantas}</td>
                <td>
                  R$ {brl(l.total)}
                  {l.custoBeneficios > 0 && (
                    <div className="store-sub" style={{ fontSize: 12 }}>
                      revisões R$ {brl(l.custoRevisoes)} + benefícios R$ {brl(l.custoBeneficios)}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {carteira.dominante && (
          <div
            className="hint"
            style={{ marginBottom: 8, borderLeft: "3px solid #4ec3e0", paddingLeft: 10 }}
          >
            <strong>Plano concentrado em “{carteira.dominante.rotulo}”.</strong>{" "}
            Aqui <strong>não há mutualização</strong>: não existe cliente leve
            para bancar o pesado, então o preço precisa cobrir esse perfil
            sozinho. Use a média abaixo como piso real, não como estimativa
            conservadora.
          </div>
        )}

        {carteira.somaPct !== 100 && carteira.somaPct > 0 && (
          <div className="hint" style={{ marginBottom: 8 }}>
            A mistura soma {carteira.somaPct}%. O cálculo normaliza para 100%,
            mas vale conferir.
          </div>
        )}

        <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
          <div>
            <div className="store-sub" style={{ fontSize: 13 }}>Média por cliente</div>
            <strong style={{ fontSize: 18 }}>R$ {brl(carteira.medio)}/ano</strong>
            <div className="store-sub" style={{ fontSize: 13 }}>
              R$ {brl(carteira.medio / 12)}/mês
            </div>
          </div>
          <div>
            <div className="store-sub" style={{ fontSize: 13 }}>
              Maior uso {carteira.dominante ? "(perfil do plano)" : "(um cliente)"}
            </div>
            <strong style={{ fontSize: 18 }}>R$ {brl(carteira.pior)}/ano</strong>
            <div className="store-sub" style={{ fontSize: 13 }}>
              R$ {brl(carteira.pior / 12)}/mês
            </div>
          </div>
        </div>

        {semEstimativa.length > 0 && (
          <div
            className="hint"
            style={{ marginTop: 10, color: "var(--danger)" }}
          >
            <strong>O total está otimista.</strong> Sem valor estimado:{" "}
            {semEstimativa.join(", ")}. Enquanto ficarem em branco, esses
            benefícios contam como zero.
          </div>
        )}

        <div className="hint" style={{ marginTop: 10 }}>
          Este é o valor que o cliente pagaria <strong>sem plano</strong>, no
          preço de tabela da loja. Ele <strong>não conta a retenção</strong> —
          quem volta à loja compra o que não está coberto e tende a trocar de
          veículo ali. Um plano que empata com o avulso e traz o cliente de
          volta já vale a pena.
        </div>
      </div>
      </BlocoForm>

      <BlocoForm
        titulo={"Tetos e exclusões"}
        resumo={resumoTetos}
        aberto={abertos.tetos}
        onToggle={() => alternar("tetos")}
        temErro={errosTetos}
        opcional={true}
      >
      <p className="hint" style={{ marginTop: 0, marginBottom: 12 }}>
        Em branco = <strong>sem limite</strong>, e é assim que a maioria dos
        planos deve nascer. O plano é mutualizado: o cliente que usa muito é
        bancado pelos que usam pouco, e ele costuma ser o mais fiel à loja —
        volta, compra o que não está coberto e troca de veículo ali. Limitar o
        uso desestimula justamente a visita que o plano existe para provocar.
        <br />
        <br />
        Use um teto apenas se esta loja tiver uma concentração real de um perfil
        (uma carteira quase toda de entregadores, por exemplo) — aí a
        mutualização não se sustenta e o limite protege o pool. Preenchendo mais
        de um, vale o que for atingido primeiro.
        <br />
        <em>
          Hoje o sistema não bloqueia automaticamente — não existe registro de
          utilização. Quem confere é a loja, no atendimento.
        </em>
      </p>
      <div className="grid">
        <div className="field col-1">
          <label htmlFor="limiteRevisoesAno">Revisões por 12 meses</label>
          <input id="limiteRevisoesAno" name="limiteRevisoesAno" inputMode="numeric" value={limRev}
            onChange={(e) => setLimRev(e.target.value.replace(/\D/g, "").slice(0, 3))} placeholder="sem limite" />
        </div>
        <div className="field col-1">
          <label htmlFor="limiteKmAno">Km por ano</label>
          <input id="limiteKmAno" name="limiteKmAno" inputMode="numeric" value={limKm}
            onChange={(e) => setLimKm(e.target.value.replace(/\D/g, "").slice(0, 7))} placeholder="sem limite" />
        </div>
        <div className="field col-1">
          <label htmlFor="limiteValorPecasAno">Peças por ano (R$)</label>
          <input id="limiteValorPecasAno" name="limiteValorPecasAno" inputMode="decimal" value={limPecas}
            onChange={(e) => setLimPecas(soValor(e.target.value))} placeholder="sem limite" />
        </div>
        <div className="field col-1">
          <label htmlFor="limiteValorMaoObraAno">Mão de obra por ano (R$)</label>
          <input id="limiteValorMaoObraAno" name="limiteValorMaoObraAno" inputMode="decimal" value={limMO}
            onChange={(e) => setLimMO(soValor(e.target.value))} placeholder="sem limite" />
        </div>
        <div className="field col-1">
          <label htmlFor="limiteValorTotalAno">Total coberto por ano (R$)</label>
          <input id="limiteValorTotalAno" name="limiteValorTotalAno" inputMode="decimal" value={limTotal}
            onChange={(e) => setLimTotal(soValor(e.target.value))} placeholder="sem limite" />
        </div>
      </div>

      <div className="field">
        <label htmlFor="exclusoes">O que NÃO está coberto</label>
        <textarea
          id="exclusoes"
          name="exclusoes"
          value={exclusoes}
          onChange={(e) => setExclusoes(e.target.value)}
          rows={3}
          placeholder="Ex.: pneus, pastilhas de freio, embreagem, danos por colisão, uso indevido…"
        />
        <span className="hint">
          Texto livre. Não entra em cálculo — é o que evita discussão no balcão e
          o que vai para o contrato.
        </span>
      </div>

      {/* ── Argumentos de venda ── */}
      <div style={{ fontWeight: 600, margin: "24px 0 6px" }}>
        Argumentos de venda
      </div>
      <p className="hint" style={{ marginTop: 0, marginBottom: 12 }}>
        Cenários que o vendedor mostra ao cliente. Escreva na linguagem do
        balcão, não na do contrato.
      </p>
      <div className="banner" style={{ background: "rgba(184,134,11,.10)", borderLeft: "3px solid #b8860b", marginBottom: 12 }}>
        <strong>Cuidado ao escrever.</strong> Material de venda pesa mais que o
        contrato numa reclamação. Não prometa o que as exclusões do plano
        negam — se o cliente paga a peça, diga isso.
      </div>

      {argumentos.map((a, i) => (
        <div
          key={i}
          style={{ border: "1px solid var(--line)", borderRadius: 8, padding: "12px 14px", marginBottom: 10 }}
        >
          <div style={{ display: "flex", gap: 10, marginBottom: 8 }}>
            <input
              value={a.titulo}
              onChange={(e) => alterarArgumento(i, "titulo", e.target.value)}
              placeholder="Ex.: Sua moto caiu e quebrou o retrovisor"
              style={{ fontWeight: 600, flex: 1 }}
              aria-label="Título do argumento"
            />
            <button
              type="button"
              className="btn-ghost"
              style={{ padding: "4px 10px", fontSize: 13 }}
              onClick={() => setArgumentos((as) => as.filter((_, idx) => idx !== i))}
            >
              Remover
            </button>
          </div>
          <textarea
            value={a.texto}
            onChange={(e) => alterarArgumento(i, "texto", e.target.value)}
            rows={4}
            placeholder="Desenvolva o cenário em duas ou três frases."
            aria-label="Texto do argumento"
          />
        </div>
      ))}

      <div style={{ display: "flex", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
        <button
          type="button"
          className="btn-ghost"
          style={{ padding: "6px 14px", fontSize: 13 }}
          onClick={() => setArgumentos((as) => [...as, { titulo: "", texto: "" }])}
        >
          + Adicionar argumento
        </button>
        {argumentos.length === 0 && (
          <button
            type="button"
            className="btn-ghost"
            style={{ padding: "6px 14px", fontSize: 13 }}
            onClick={usarSugestoes}
          >
            Usar sugestões para estes veículos
          </button>
        )}
      </div>

      <div className="field">
        <label htmlFor="condicoes">Condições contratuais</label>
        <textarea
          id="condicoes"
          name="condicoes"
          value={condicoes}
          onChange={(e) => setCondicoes(e.target.value)}
          rows={3}
          placeholder="Ex.: todas as peças devem ter nota fiscal; a concessionária não se responsabiliza por peças trazidas pelo cliente…"
        />
        <span className="hint">
          Diferente das exclusões: não é o que o plano deixa de cobrir, é{" "}
          <strong>como</strong> a cobertura funciona. Vai para o contrato.
        </span>
      </div>

      <input type="hidden" name="beneficios" value={JSON.stringify(beneficios)} />
      <input type="hidden" name="argumentos" value={JSON.stringify(argumentos)} />

      {/* Revisões viajam como JSON: são linhas variáveis, e um campo por linha
          viraria uma sopa de nomes indexados no FormData. */}
      <input type="hidden" name="revisoes" value={JSON.stringify(revisoes)} />
      </BlocoForm>

      <BlocoForm
        titulo={"Modelos cobertos"}
        resumo={resumoModelos}
        aberto={abertos.modelos}
        onToggle={() => alternar("modelos")}
        temErro={errosModelos}
        opcional={false}
      >
      {err.modelos && (
        <div className="banner banner-error">{err.modelos}</div>
      )}

      <div className="model-picker">
      {/* Modo de preço + margem: as duas decisões que mudam o que os campos
          abaixo significam. */}
      <div
        style={{
          border: "1px solid var(--line)",
          borderRadius: 8,
          padding: "12px 14px",
          marginBottom: 14,
        }}
      >
        <label style={{ display: "flex", alignItems: "flex-start", gap: 8, cursor: "pointer" }}>
          <input
            type="checkbox"
            name="precoPeloGrupo"
            checked={precoPeloGrupo}
            onChange={(e) => setPrecoPeloGrupo(e.target.checked)}
            style={{ width: "auto", margin: "3px 0 0 0" }}
          />
          <span>
            <span style={{ fontWeight: 600 }}>O grupo define o preço das lojas</span>
            <br />
            <span className="hint">
              {precoPeloGrupo
                ? "O valor abaixo passa a valer para todas as lojas do grupo, e o plano já nasce vendável — a loja não precisa precificar. Se alguma loja já tinha preço próprio neste plano, ele será substituído."
                : "Cada loja define o próprio preço, respeitando o mínimo abaixo. Marque se o grupo é pequeno e o preço é decidido num lugar só."}
            </span>
          </span>
        </label>

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: 14 }}>Acréscimo sobre o avulso</span>
          <input
            inputMode="decimal"
            value={margem}
            onChange={(e) => setMargem(soValor(e.target.value))}
            style={{ width: 70, padding: "4px 8px", fontSize: 13 }}
            aria-label="Acréscimo sobre o valor avulso, em porcentagem"
          />
          <span style={{ fontSize: 14 }}>%</span>
          <span className="hint">
            Multiplicado <strong>sobre o valor avulso</strong>: com{" "}
            {margem || 0}%, R$ 100,00 vira R${" "}
            {brl(100 * (1 + parseNum(margem) / 100))}.
            {parseNum(margem) > 0 && (
              <>
                {" "}
                Isso equivale a uma margem de{" "}
                <strong>
                  {(100 * (parseNum(margem) / 100) / (1 + parseNum(margem) / 100)).toFixed(1)}%
                </strong>{" "}
                sobre o valor final.
              </>
            )}
            <br />
            Como a base já é o preço cobrado (que inclui sua margem), este
            acréscimo funciona como <strong>colchão de risco</strong>. Repare no
            valor avulso ao lado de cada modelo: acima dele, o plano fica mais
            caro que pagar revisão a revisão.
          </span>
        </div>
      </div>

        <div className="model-picker-toolbar">
          <input
            type="text"
            placeholder="Buscar modelo…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="model-search"
          />
          <select
            value={fabFiltro}
            onChange={(e) => setFabFiltro(e.target.value)}
            className="model-fab-filter"
          >
            <option value="">Todos os fabricantes</option>
            {fabricantesDisponiveis.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
          <button type="button" className="btn-ghost btn-sm" onClick={marcarTodosFiltrados}>
            Marcar todos {busca || fabFiltro ? "(filtrados)" : ""}
          </button>
          <button type="button" className="btn-ghost btn-sm" onClick={limpar}>
            Limpar
          </button>
          <span className="model-count">{selecionados.size} selecionado(s)</span>
        </div>

        <div className="model-list">
          {filtrados.length === 0 && (
            <div className="hint" style={{ padding: 12 }}>
              Nenhum modelo encontrado.
            </div>
          )}
          {/* Renderiza TODOS os modelos sempre; o filtro apenas esconde via CSS.
              Assim os checkboxes marcados são enviados nativamente pelo browser
              (name="modelos"), mesmo os que estão fora do filtro atual. */}
          {modelos.map((m) => {
            const visivel = filtrados.some((f) => f.id === m.id);
            const marcado = selecionados.has(m.id);
            const preco = precosMinimos[m.id] ?? "";
            const semPreco = marcado && parseNum(preco) <= 0;
            return (
              <div
                key={m.id}
                className="model-item"
                style={{
                  ...(visivel ? {} : { display: "none" }),
                  alignItems: "center",
                  gap: 10,
                  ...(semPreco ? { borderLeft: "3px solid var(--danger)" } : {}),
                }}
              >
                <label style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, cursor: "pointer", minWidth: 0 }}>
                  <input
                    type="checkbox"
                    checked={marcado}
                    onChange={() => toggle(m.id)}
                  />
                  <span className="model-label">{m.label}</span>
                  <span className="model-tag">{m.categoria}</span>
                </label>

                {/* Fator e mínimo ficam na MESMA linha do modelo: a decisão de
                    preço se toma olhando o veículo, não numa tela separada. */}
                {marcado && (() => {
                  const sugestao = custoMensalDoModelo(m.id);
                  const sugerido = precoSugerido(m.id);
                  const abaixoDoCusto = parseNum(preco) > 0 && parseNum(preco) < sugestao;
                  return (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 10, whiteSpace: "nowrap" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                        <span className="store-sub" style={{ fontSize: 12 }}>fator</span>
                        <input
                          inputMode="decimal"
                          value={fatores[m.id] ?? ""}
                          onChange={(e) =>
                            setFatores((f) => ({ ...f, [m.id]: soValor(e.target.value) }))
                          }
                          placeholder="1,00"
                          aria-label={`Fator de custo de ${m.label}`}
                          title="Quanto este modelo custa para revisar em relação ao de referência. 1,40 = 40% mais caro."
                          style={{ width: 62, padding: "4px 8px", fontSize: 13 }}
                        />
                      </span>

                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                        <span className="store-sub" style={{ fontSize: 12 }}>
                          {precoPeloGrupo ? "preço R$" : "mín. R$"}
                        </span>
                        <input
                          inputMode="decimal"
                          value={preco}
                          onChange={(e) =>
                            setPrecosMinimos((p) => ({ ...p, [m.id]: soValor(e.target.value) }))
                          }
                          placeholder="0,00"
                          aria-label={`Preço mínimo de ${m.label}`}
                          style={{
                            width: 90,
                            padding: "4px 8px",
                            fontSize: 13,
                            borderColor: semPreco || abaixoDoCusto ? "var(--danger)" : undefined,
                          }}
                        />
                      </span>

                      {sugestao > 0 && (
                        <span
                          className="store-sub"
                          style={{ fontSize: 12, whiteSpace: "nowrap" }}
                          title="Quanto este cliente pagaria sem plano, no perfil médio da carteira"
                        >
                          avulso R$ {brl(sugestao)}
                        </span>
                      )}

                      {sugerido > 0 && (
                        <button
                          type="button"
                          onClick={() =>
                            setPrecosMinimos((p) => ({ ...p, [m.id]: brl(sugerido) }))
                          }
                          title={`Avulso R$ ${brl(sugestao)}/mês + ${margem}% = R$ ${brl(sugerido)}`}
                          style={{
                            fontSize: 12,
                            padding: "3px 8px",
                            borderRadius: 6,
                            border: "1px solid var(--line)",
                            background: "transparent",
                            cursor: "pointer",
                            color: abaixoDoCusto ? "var(--danger)" : "var(--ink-soft)",
                          }}
                        >
                          usar R$ {brl(sugerido)}
                        </button>
                      )}
                    </span>
                  );
                })()}
              </div>
            );
          })}
        </div>
      </div>
      </BlocoForm>

      <input type="hidden" name="modelos" value={JSON.stringify(modelosParaEnviar)} />

      {abaixoDoCusto.length > 0 && (
        <div className="banner banner-error">
          <strong>
            {abaixoDoCusto.length === 1
              ? "1 modelo está com valor abaixo do avulso"
              : `${abaixoDoCusto.length} modelos estão com valor abaixo do avulso`}
            :
          </strong>{" "}
          {abaixoDoCusto.map((m) => m.label).join(", ")}. Nesses casos o plano
          rende menos que atender o mesmo cliente avulso — pode ser uma escolha
          consciente para ganhar adesão, mas vale saber que é o que está
          acontecendo.
        </div>
      )}

      {semPrecoMinimo.length > 0 && (
        <div className="banner banner-error">
          {semPrecoMinimo.length === 1
            ? "1 modelo selecionado está sem preço mínimo."
            : `${semPrecoMinimo.length} modelos selecionados estão sem preço mínimo.`}{" "}
          Sem o piso, a loja poderia vender por qualquer valor.
        </div>
      )}

      <div className="actions">
        <button type="submit" className="btn-primary" disabled={pending || semPrecoMinimo.length > 0}>
          {pending ? "Salvando…" : rotuloBotao}
        </button>
        <a href="/planos" className="btn-ghost" style={{ padding: "11px 20px" }}>
          Cancelar
        </a>
      </div>
    </form>
  );
}
