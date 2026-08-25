import { getAuth } from '@/lib/auth/server';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Dreno de erros do cliente para os Workers Logs.
 *
 * Existe porque o `catch` do fluxo de publicação só fazia `console.error` no browser: em
 * 24/08 um participante passou 4 minutos no app sem que um único `POST /api/upload`
 * chegasse ao servidor, e não havia como saber em que etapa quebrou. Ver
 * `.specs/features/publish-observability/spec.md`.
 *
 * Sem sessão o evento é logado com `userId: null` em vez de 401 — a falha pode ser
 * justamente de sessão, e perder o log é pior que registrar um evento anônimo.
 */
const MAX_BODY_BYTES = 2048;

interface ClientErrorPayload {
  stage?: string;
  message?: string;
  meta?: Record<string, unknown>;
}

export async function POST(request: NextRequest) {
  try {
    const raw = (await request.text()).slice(0, MAX_BODY_BYTES);

    let payload: ClientErrorPayload = {};
    try {
      payload = JSON.parse(raw) as ClientErrorPayload;
    } catch {
      payload = { message: raw };
    }

    let userId: string | null = null;
    try {
      const auth = await getAuth();
      const session = await auth.api.getSession({ headers: request.headers });
      userId = session?.user?.id ?? null;
    } catch {
      // Sessão indisponível não invalida o log — segue com userId null.
    }

    console.error('[publish] client_error', {
      userId,
      stage: payload.stage ?? 'unknown',
      message: payload.message ?? '',
      meta: payload.meta ?? {},
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('[publish] client_error_drain_failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return new NextResponse(null, { status: 204 });
  }
}
