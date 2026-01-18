'use client';

import { createClient } from '@/lib/supabase/client';
import { Comment } from '@/lib/types';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';

interface CommentSectionProps {
  postId: string;
  currentUserId: string;
  onClose: () => void;
}

export default function CommentSection({ postId, currentUserId, onClose }: CommentSectionProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchComments();
  }, [postId]);

  const fetchComments = async () => {
    const supabase = createClient();

    const { data, error } = await supabase
      .from('comments')
      .select(`
        *,
        user:users(id, name, avatar_url)
      `)
      .eq('post_id', postId)
      .order('created_at', { ascending: true });

    if (!error && data) {
      setComments(data as Comment[]);
    }
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || submitting) return;

    setSubmitting(true);
    const supabase = createClient();

    const { data, error } = await supabase
      .from('comments')
      .insert({
        post_id: postId,
        user_id: currentUserId,
        content: newComment.trim(),
      })
      .select(`
        *,
        user:users(id, name, avatar_url)
      `)
      .single();

    if (!error && data) {
      setComments((prev) => [...prev, data as Comment]);
      setNewComment('');
    }

    setSubmitting(false);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / (1000 * 60));

    if (minutes < 1) return 'Agora';
    if (minutes < 60) return `${minutes}min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    return `${days}d`;
  };

  return (
    <div className="mt-3 border-t border-gray-100 pt-3">
      {/* Comments list */}
      <div className="max-h-48 overflow-y-auto space-y-3 mb-3">
        {loading ? (
          <p className="text-sm text-gray-500">Carregando...</p>
        ) : comments.length === 0 ? (
          <p className="text-sm text-gray-500">Nenhum comentario ainda</p>
        ) : (
          comments.map((comment) => (
            <div key={comment.id} className="flex gap-2">
              <Link href={`/profile/${comment.user_id}`}>
                <div className="w-8 h-8 rounded-full bg-gray-200 overflow-hidden shrink-0">
                  {comment.user?.avatar_url ? (
                    <Image
                      src={comment.user.avatar_url}
                      alt={comment.user.name}
                      width={32}
                      height={32}
                      className="object-cover w-full h-full"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-primary text-white text-xs font-bold">
                      {comment.user?.name?.charAt(0).toUpperCase() || '?'}
                    </div>
                  )}
                </div>
              </Link>
              <div className="flex-1">
                <p className="text-sm">
                  <Link href={`/profile/${comment.user_id}`} className="font-semibold">
                    {comment.user?.name}
                  </Link>{' '}
                  {comment.content}
                </p>
                <p className="text-xs text-gray-500">{formatDate(comment.created_at)}</p>
              </div>
            </div>
          ))
        )}
      </div>

      {/* New comment form */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder="Adicione um comentario..."
          className="flex-1 text-sm border border-gray-200 rounded-full px-4 py-2 outline-none focus:border-primary"
        />
        <button
          type="submit"
          disabled={!newComment.trim() || submitting}
          className="text-primary font-semibold text-sm disabled:opacity-50"
        >
          Enviar
        </button>
      </form>
    </div>
  );
}
