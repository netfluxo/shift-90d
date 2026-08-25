/**
 * Envia uma falha de cliente para `/api/client-error`, que a repassa aos Workers Logs.
 *
 * Fire-and-forget de propósito: o relato de erro nunca deve atrasar nem mascarar o erro
 * original que o usuário está vendo. `keepalive` garante a entrega mesmo se ele fechar a
 * aba logo depois.
 */
export type PublishStage = 'validate' | 'resize' | 'upload' | 'create-post';

export function reportClientError(
  stage: PublishStage,
  error: unknown,
  meta: Record<string, unknown> = {}
): void {
  const message =
    error instanceof Error ? `${error.name}: ${error.message}` : String(error);

  try {
    void fetch('/api/client-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage, message, meta }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Sem rede não há o que fazer — o usuário já vê a mensagem de erro na UI.
  }
}
