'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Post } from '@/lib/types';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import PostContent from './PostContent';

interface PostCardProps {
  post: Post;
  currentUserId: string;
}

export default function PostCard({ post, currentUserId }: PostCardProps) {
  const router = useRouter();
  const [showMenu, setShowMenu] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const isOwner = post.user_id === currentUserId;

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();

    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (minutes < 1) return 'Agora';
    if (minutes < 60) return `${minutes}min`;
    if (hours < 24) return `${hours}h`;
    if (days < 7) return `${days}d`;
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  };

  const handleDelete = async () => {
    if (!confirm('Tem certeza que deseja apagar esta publicação?')) return;

    // Fecha o menu ANTES do await — Safari guarda um Range apontando pro botão
    // clicado; se o nó for desmontado durante o await, disparamos um
    // "Can't find variable: EmptyRanges" no cleanup interno do WebKit.
    setShowMenu(false);
    if (typeof document !== 'undefined') {
      (document.activeElement as HTMLElement | null)?.blur();
      window.getSelection()?.removeAllRanges();
    }

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/posts/${post.id}`, { method: 'DELETE' });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Erro ao apagar publicação');
      }

      router.refresh();
    } catch (error) {
      console.error('Error deleting post:', error);
      alert('Erro ao apagar publicação. Tente novamente.');
    }
    setIsDeleting(false);
  };

  return (
    <article className="bg-white border-b border-gray-100">
      {/* Header */}
      <div className="flex items-center justify-between p-3">
        <Link href={`/profile/${post.user_id}`} className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gray-200 overflow-hidden">
            {post.user?.avatar_url ? (
              <Image
                src={post.user.avatar_url}
                alt={post.user.name}
                width={40}
                height={40}
                className="object-cover w-full h-full"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-primary text-white font-bold">
                {post.user?.name?.charAt(0).toUpperCase() || '?'}
              </div>
            )}
          </div>
          <div>
            <p className="font-semibold text-sm">{post.user?.name || 'Usuario'}</p>
            <p className="text-xs text-gray-500">{formatDate(post.created_at)}</p>
          </div>
        </Link>

        {isOwner && (
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition"
            >
              <MoreIcon className="w-5 h-5 text-gray-500" />
            </button>
            {showMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
                <div className="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-lg border border-gray-200 z-20 min-w-[160px]">
                  <button
                    onClick={handleDelete}
                    disabled={isDeleting}
                    className="w-full text-left px-4 py-3 text-sm text-red-600 hover:bg-red-50 transition disabled:opacity-50"
                  >
                    {isDeleting ? 'Apagando...' : 'Apagar publicação'}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Post Content */}
      <PostContent post={post} currentUserId={currentUserId} />
    </article>
  );
}

function MoreIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="5" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="12" cy="19" r="2" />
    </svg>
  );
}
