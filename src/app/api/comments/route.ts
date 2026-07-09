import { getAuth } from '@/lib/auth/server';
import { postExists, createComment, getCommentsByPostId } from '@/lib/db/queries/comments';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  console.log('[API /comments] POST request received');

  try {
    // Check authentication
    const session = await getAuth().api.getSession({ headers: request.headers });

    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Parse request body
    const body = (await request.json()) as { post_id?: string; content?: string };
    const { post_id, content } = body;

    // Validate input
    if (!post_id || !content) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: post_id and content' },
        { status: 400 }
      );
    }

    // Validate content
    const trimmedContent = content.trim();
    if (trimmedContent.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Comment content cannot be empty' },
        { status: 400 }
      );
    }

    if (trimmedContent.length > 500) {
      return NextResponse.json(
        { success: false, error: 'Comment content cannot exceed 500 characters' },
        { status: 400 }
      );
    }

    // Verify post exists
    const exists = await postExists(post_id);
    if (!exists) {
      return NextResponse.json(
        { success: false, error: 'Post not found' },
        { status: 404 }
      );
    }

    // Create comment
    const comment = await createComment(session.user.id, post_id, trimmedContent);

    return NextResponse.json({
      success: true,
      comment,
    });
  } catch (error) {
    console.error('Unexpected error in POST /api/comments:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  console.log('[API /comments] GET request received');

  try {
    // Check authentication
    const session = await getAuth().api.getSession({ headers: request.headers });

    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get post_id from query params
    const { searchParams } = new URL(request.url);
    const post_id = searchParams.get('post_id');

    if (!post_id) {
      return NextResponse.json(
        { success: false, error: 'Missing required query parameter: post_id' },
        { status: 400 }
      );
    }

    // Fetch comments
    const comments = await getCommentsByPostId(post_id);

    return NextResponse.json({
      success: true,
      comments,
    });
  } catch (error) {
    console.error('Unexpected error in GET /api/comments:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
