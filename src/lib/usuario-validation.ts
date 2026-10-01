import { z } from "zod";
import { soDigitos } from "./loja-validation";

// Papéis que podem ser atribuídos ao criar um usuário.
export const PAPEIS = [
  { valor: "group_admin", rotulo: "Admin do grupo" },
  { valor: "store_manager", rotulo: "Gestor da loja" },
  { valor: "store_admin", rotulo: "Vendedor (loja)" },
  { valor: "veilig_admin", rotulo: "Admin Veilig" },
] as const;

export const novoUsuarioSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome."),
  email: z.string().trim().email("E-mail inválido."),
  // OPCIONAL desde que a senha deixou de ser derivada do CPF. Ele era exigido
  // porque a provisória vinha dos primeiros dígitos; hoje é aleatória, e o
  // login é por e-mail. Continua validado quando preenchido — CPF errado no
  // cadastro é pior que CPF ausente.
  cpf: z
    .string()
    .trim()
    .optional()
    .default("")
    .refine(
      (v) => !soDigitos(v) || soDigitos(v).length === 11,
      "CPF deve ter 11 dígitos."
    ),
  role: z.enum(["veilig_admin", "group_admin", "store_manager", "store_admin"], {
    message: "Selecione o papel.",
  }),
  groupId: z.string().uuid().optional().or(z.literal("")),
  storeId: z.string().uuid().optional().or(z.literal("")),
});

export type NovoUsuarioInput = z.infer<typeof novoUsuarioSchema>;

