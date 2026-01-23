'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Post } from '@/lib/types';
import PostContent from './PostContent';

interface PostCardProps {
  post: Post;
  currentUserId: string;
}

export default function PostCard({ post, currentUserId }: PostCardProps) {
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

  const getAvatarRingClass = () => {
    const ranking = post.user_ranking;
    if (ranking === 1) return 'ring-2 ring-yellow-500';
    if (ranking === 2) return 'ring-2 ring-gray-400';
    if (ranking === 3) return 'ring-2 ring-amber-600';
    return '';
  };

  return (
    <article className="bg-white border-b border-gray-100">
      {/* Header */}
      <div className="flex items-center p-3">
        <Link href={`/profile/${post.user_id}`} className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-full bg-gray-200 overflow-hidden ${getAvatarRingClass()}`}>
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
      </div>

      {/* Post Content */}
      <PostContent post={post} currentUserId={currentUserId} />
    </article>
  );
}
