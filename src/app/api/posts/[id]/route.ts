import { createClient } from '@/lib/supabase/server';
import { getDateInBrazil } from '@/lib/utils/timezone';
import { NextRequest, NextResponse } from 'next/server';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { id: postId } = await params;

    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Fetch the post to verify ownership and get its date
    const { data: post, error: fetchError } = await supabase
      .from('posts')
      .select('id, user_id, created_at')
      .eq('id', postId)
      .single();

    if (fetchError || !post) {
      return NextResponse.json(
        { success: false, error: 'Post not found' },
        { status: 404 }
      );
    }

    if (post.user_id !== user.id) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    }

    const postDateBrazil = getDateInBrazil(new Date(post.created_at));

    // Delete the post (likes and comments cascade via FK)
    const { error: deleteError } = await supabase
      .from('posts')
      .delete()
      .eq('id', postId);

    if (deleteError) {
      console.error('Error deleting post:', deleteError);
      return NextResponse.json(
        { success: false, error: 'Failed to delete post' },
        { status: 500 }
      );
    }

    // Count remaining posts for that day
    const { count: remainingPosts } = await supabase
      .from('posts')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('created_at', `${postDateBrazil}T00:00:00-03:00`)
      .lt('created_at', `${postDateBrazil}T23:59:59.999-03:00`);

    const remaining = remainingPosts || 0;

    if (remaining === 0) {
      // No posts left that day — remove the point
      const { data: userData } = await supabase
        .from('users')
        .select('points')
        .eq('id', user.id)
        .single();

      if (userData && userData.points > 0) {
        await supabase
          .from('users')
          .update({ points: userData.points - 1 })
          .eq('id', user.id);
      }

      // Delete the activity record for that day
      await supabase
        .from('user_activity')
        .delete()
        .eq('user_id', user.id)
        .eq('activity_date', postDateBrazil);
    } else {
      // Still has posts that day — update activity count
      await supabase
        .from('user_activity')
        .update({
          posts_count: remaining,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id)
        .eq('activity_date', postDateBrazil);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Unexpected error in DELETE /api/posts/[id]:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
