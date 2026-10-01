// Log que só aparece em desenvolvimento. Em produção fica silencioso, evitando
// vazar dados/ruído nos logs do servidor. Para erros de verdade, use console.error
// diretamente (esses queremos ver sempre, inclusive em produção).
export function logDev(...args: unknown[]) {
  if (process.env.NODE_ENV !== "production") {
    console.log(...args);
  }
}
