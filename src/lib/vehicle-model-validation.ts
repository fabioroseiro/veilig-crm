import { z } from "zod";

export const CATEGORIAS = [
  { valor: "moto", rotulo: "Moto" },
  { valor: "leve", rotulo: "Leve" },
  { valor: "pesado", rotulo: "Pesado" },
  { valor: "utilitario", rotulo: "Utilitário" },
] as const;

// Um modelo de veículo: fabricante + modelo + versão (opcional) + categoria.
// O ANO NÃO entra aqui: ele é do veículo do cliente, não do modelo. Quem
// informa é o vendedor na venda.
export const vehicleModelSchema = z.object({
  fabricante: z.string().trim().min(1, "Informe o fabricante."),
  modelo: z.string().trim().min(1, "Informe o modelo."),
  versao: z.string().trim().optional().default(""), // ex.: TSI, GLI
  categoria: z.enum(["moto", "leve", "pesado", "utilitario"], {
    message: "Selecione a categoria.",
  }),
});

export type VehicleModelInput = z.infer<typeof vehicleModelSchema>;
