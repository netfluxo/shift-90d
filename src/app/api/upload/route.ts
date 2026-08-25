import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { getAuth } from '@/lib/auth/server';

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/svg+xml': '.svg',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
};

export async function POST(request: Request) {
  // Fora do try para que o catch consiga atribuir a falha a um usuário.
  let userId: string | null = null;

  try {
    // Validate session
    const auth = getAuth();
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session?.user) {
      console.error('[publish] upload_unauthorized');
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    userId = session.user.id;

    // Parse multipart form
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const type = formData.get('type') as string | null;

    // Validate inputs
    if (!file) {
      console.error('[publish] upload_missing_file', { userId });
      return NextResponse.json(
        { error: 'Missing file field' },
        { status: 400 }
      );
    }

    if (!type || !['post', 'avatar'].includes(type)) {
      console.error('[publish] upload_invalid_type', { userId, type });
      return NextResponse.json(
        { error: 'Invalid or missing type field (must be "post" or "avatar")' },
        { status: 400 }
      );
    }

    // Infer extension from content-type
    const contentType = file.type || 'application/octet-stream';
    const ext = MIME_TO_EXT[contentType] || '';

    // Generate unique key
    const prefix = type === 'post' ? 'posts' : 'avatars';
    const key = `${prefix}/${crypto.randomUUID()}${ext}`;

    // Get R2 binding
    const { env } = getCloudflareContext();

    // Convert file to ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();

    // Upload to R2
    await env.PHOTOS_BUCKET.put(key, arrayBuffer, {
      httpMetadata: { contentType },
    });

    // Generate public URL
    const publicUrl = `${process.env.NEXT_PUBLIC_R2_PUBLIC_URL}/${key}`;

    console.log('[publish] upload_ok', {
      userId,
      key,
      contentType,
      sizeBytes: arrayBuffer.byteLength,
    });

    return NextResponse.json(
      { key, url: publicUrl },
      { status: 200 }
    );
  } catch (error) {
    // `errorMessage`, não `error`: chave reservada do evento de log (ver /api/client-error).
    console.error('[publish] upload_failed', {
      userId,
      errorMessage: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
