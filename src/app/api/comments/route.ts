import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  console.log('[API /comments] Request received');

  try {
    const supabase = await createClient();

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    console.log('[API /comments] Auth result:', { hasUser: !!user, userId: user?.id, error: authError?.message });

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Parse request body
    const body = await request.json();
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
    const { data: post, error: postError } = await supabase
      .from('posts')
      .select('id')
      .eq('id', post_id)
      .maybeSingle();

    if (postError || !post) {
      return NextResponse.json(
        { success: false, error: 'Post not found' },
        { status: 404 }
      );
    }

    // Insert comment
    const { data: comment, error: insertError } = await supabase
      .from('comments')
      .insert({
        user_id: user.id,
        post_id: post_id,
        content: trimmedContent,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error creating comment:', insertError);
      return NextResponse.json(
        { success: false, error: 'Failed to create comment' },
        { status: 500 }
      );
    }

    // Fetch comment with user data
    const { data: commentWithUser, error: fetchError } = await supabase
      .from('comments')
      .select(`
        *,
        user:users(
          id,
          name,
          avatar_url
        )
      `)
      .eq('id', comment.id)
      .single();

    if (fetchError) {
      console.error('Error fetching comment with user:', fetchError);
      // Return comment without user data if fetch fails
      return NextResponse.json({
        success: true,
        comment,
      });
    }

    return NextResponse.json({
      success: true,
      comment: commentWithUser,
    });
  } catch (error) {
    console.error('Unexpected error in POST /api/comments:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
