/** Why OpenRouter gave no usable reply: a stable code, mapped from the HTTP status. */
export type OpenRouterFailure = "key-rejected" | "no-credits" | "rate-limited" | "unavailable";

/**
 * One line each for the person who asked: what went wrong and what to do next. The routes show
 * these as-is, so OpenRouter's own status and English error body belong in the server log only.
 */
export const FAILURE_MESSAGES: Record<OpenRouterFailure, string> = {
  "key-rejected":
    "A OpenRouter recusou a chave salva em Ajustes. Confira a chave em Ajustes → Chave da OpenRouter.",
  "no-credits": "Acabaram os créditos da OpenRouter. Adicione créditos na conta e tente de novo.",
  "rate-limited": "A OpenRouter está recebendo pedidos demais agora. Espere um pouco e tente de novo.",
  unavailable: "A OpenRouter não respondeu como esperado. Tente de novo em instantes.",
};

/** The statuses OpenRouter documents (openrouter.ai/docs/api-reference/errors) that the person can
 * act on; every other one, 5xx included, isn't theirs to fix. */
export function failureForStatus(status: number): OpenRouterFailure {
  if (status === 401 || status === 403) return "key-rejected";
  if (status === 402) return "no-credits";
  if (status === 429) return "rate-limited";
  return "unavailable";
}
