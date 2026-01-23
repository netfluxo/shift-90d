import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  console.log('[API /likes] Request received');

  try {
    const supabase = await createClient();

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    console.log('[API /likes] Auth result:', { hasUser: !!user, userId: user?.id, error: authError?.message });

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { post_id } = body;

    // Validate input
    if (!post_id) {
      return NextResponse.json(
        { success: false, error: 'Missing required field: post_id' },
        { status: 400 }
      );
    }

    // Check if like exists
    const { data: existingLike, error: checkError } = await supabase
      .from('likes')
      .select('id')
      .eq('user_id', user.id)
      .eq('post_id', post_id)
      .maybeSingle();

    if (checkError) {
      console.error('Error checking existing like:', checkError);
      return NextResponse.json(
        { success: false, error: 'Failed to check like status' },
        { status: 500 }
      );
    }

    let action: 'liked' | 'unliked';

    if (existingLike) {
      // Unlike: delete the like
      const { error: deleteError } = await supabase
        .from('likes')
        .delete()
        .eq('id', existingLike.id);

      if (deleteError) {
        console.error('Error deleting like:', deleteError);
        return NextResponse.json(
          { success: false, error: 'Failed to unlike post' },
          { status: 500 }
        );
      }

      action = 'unliked';
    } else {
      // Like: create new like
      const { error: insertError } = await supabase
        .from('likes')
        .insert({
          user_id: user.id,
          post_id: post_id,
        });

      if (insertError) {
        console.error('Error creating like:', insertError);
        return NextResponse.json(
          { success: false, error: 'Failed to like post' },
          { status: 500 }
        );
      }

      action = 'liked';
    }

    // Get updated like count
    const { count: likesCount, error: countError } = await supabase
      .from('likes')
      .select('*', { count: 'exact', head: true })
      .eq('post_id', post_id);

    if (countError) {
      console.error('Error counting likes:', countError);
      return NextResponse.json(
        { success: false, error: 'Failed to get like count' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      action,
      likes_count: likesCount || 0,
    });
  } catch (error) {
    console.error('Unexpected error in POST /api/likes:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
