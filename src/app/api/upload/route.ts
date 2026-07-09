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
  try {
    // Validate session
    const auth = getAuth();
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Parse multipart form
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const type = formData.get('type') as string | null;

    // Validate inputs
    if (!file) {
      return NextResponse.json(
        { error: 'Missing file field' },
        { status: 400 }
      );
    }

    if (!type || !['post', 'avatar'].includes(type)) {
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

    return NextResponse.json(
      { key, url: publicUrl },
      { status: 200 }
    );
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
