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

    // Busca posts restantes do mesmo dia (para decidir entre remover ponto ou realocar)
    const { data: remainingDayPosts } = await supabase
      .from('posts')
      .select('id, created_at')
      .eq('user_id', user.id)
      .gte('created_at', `${postDateBrazil}T00:00:00-03:00`)
      .lt('created_at', `${postDateBrazil}T23:59:59.999-03:00`)
      .order('created_at', { ascending: true });

    const remainingPosts = remainingDayPosts?.length || 0;

    if (remainingPosts === 0) {
      // Nenhum post sobrou no dia — remove o ponto (se havia).
      // Só insere negativo se o saldo do dia for > 0, evita negativo órfão
      // quando o post nunca gerou evento positivo (ex: falha antiga de RLS).
      const { data: dayEvents } = await supabase
        .from('point_events')
        .select('points_delta')
        .eq('user_id', user.id)
        .eq('event_date', postDateBrazil)
        .eq('source', 'post');

      const daySum = (dayEvents || []).reduce((acc, e) => acc + e.points_delta, 0);

      if (daySum > 0) {
        // post_id fica null: o post já foi deletado e o FK rejeitaria a inserção.
        const { error: eventError } = await supabase
          .from('point_events')
          .insert({
            user_id: user.id,
            event_date: postDateBrazil,
            source: 'post',
            points_delta: -1,
            post_id: null,
            notes: `post deleted (id=${postId})`,
          });

        if (eventError) {
          console.error('Error inserting point_event:', eventError);
        }
      }
    } else {
      // Ainda há posts no dia — se o evento de ponto apontava pro post deletado,
      // realoca para o post restante mais antigo, preservando o link de auditoria.
      // ON DELETE SET NULL já zerou o post_id; procuramos o evento órfão.
      const { data: orphanEvent } = await supabase
        .from('point_events')
        .select('id')
        .eq('user_id', user.id)
        .eq('event_date', postDateBrazil)
        .eq('source', 'post')
        .eq('points_delta', 1)
        .is('post_id', null)
        .maybeSingle();

      if (orphanEvent) {
        const { error: updateError } = await supabase
          .from('point_events')
          .update({
            post_id: remainingDayPosts![0].id,
            notes: `relinked after delete of ${postId}`,
          })
          .eq('id', orphanEvent.id);

        if (updateError) {
          console.error('Error relinking point_event:', updateError);
        }
      }
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
