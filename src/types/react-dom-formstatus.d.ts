// Declaração de tipo local para useFormStatus, evitando depender de
// @types/react-dom (que não está no package.json). O react-dom em runtime já
// tem a função; aqui só declaramos o tipo para o TypeScript.
declare module "react-dom" {
  export function useFormStatus(): {
    pending: boolean;
    data: FormData | null;
    method: string | null;
    action: string | ((formData: FormData) => void | Promise<void>) | null;
  };
}
