'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Post } from '@/lib/types';
import { createClient } from '@/lib/supabase/client';
import CommentSection from './CommentSection';

interface PostCardProps {
  post: Post;
  currentUserId: string;
}

export default function PostCard({ post, currentUserId }: PostCardProps) {
  const [isLiked, setIsLiked] = useState(post.is_liked || false);
  const [likesCount, setLikesCount] = useState(post.likes_count || 0);
  const [showComments, setShowComments] = useState(false);
  const [isLiking, setIsLiking] = useState(false);

  const handleLike = async () => {
    if (isLiking) return;
    setIsLiking(true);

    const supabase = createClient();

    if (isLiked) {
      // Unlike
      const { error } = await supabase
        .from('likes')
        .delete()
        .eq('user_id', currentUserId)
        .eq('post_id', post.id);

      if (!error) {
        setIsLiked(false);
        setLikesCount((prev) => prev - 1);
      }
    } else {
      // Like
      const { error } = await supabase.from('likes').insert({
        user_id: currentUserId,
        post_id: post.id,
      });

      if (!error) {
        setIsLiked(true);
        setLikesCount((prev) => prev + 1);
      }
    }

    setIsLiking(false);
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Shift90D',
          text: post.caption,
          url: window.location.href,
        });
      } catch (err) {
        console.log('Error sharing:', err);
      }
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));

    if (hours < 1) return 'Agora';
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d`;
    return date.toLocaleDateString('pt-BR');
  };

  return (
    <article className="bg-white border-b border-gray-100">
      {/* Header */}
      <div className="flex items-center p-3">
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
      </div>

      {/* Media */}
      <div className="relative aspect-square bg-gray-100">
        {post.media_type === 'video' ? (
          <video
            src={post.media_url}
            controls
            className="w-full h-full object-cover"
            playsInline
          />
        ) : (
          <Image
            src={post.media_url}
            alt={post.caption}
            fill
            className="object-cover"
            sizes="(max-width: 512px) 100vw, 512px"
          />
        )}
      </div>

      {/* Actions */}
      <div className="p-3">
        <div className="flex items-center gap-4 mb-2">
          <button
            onClick={handleLike}
            disabled={isLiking}
            className="transition-transform active:scale-125"
          >
            <HeartIcon filled={isLiked} className={`w-7 h-7 ${isLiked ? 'text-secondary' : 'text-gray-800'}`} />
          </button>
          <button onClick={() => setShowComments(!showComments)}>
            <CommentIcon className="w-7 h-7 text-gray-800" />
          </button>
          <button onClick={handleShare}>
            <ShareIcon className="w-7 h-7 text-gray-800" />
          </button>
        </div>

        {/* Likes count */}
        <p className="font-semibold text-sm mb-1">
          {likesCount} {likesCount === 1 ? 'curtida' : 'curtidas'}
        </p>

        {/* Caption */}
        <p className="text-sm">
          <span className="font-semibold">{post.user?.name}</span>{' '}
          {post.caption}
        </p>

        {/* Comments toggle */}
        {(post.comments_count || 0) > 0 && !showComments && (
          <button
            onClick={() => setShowComments(true)}
            className="text-gray-500 text-sm mt-1"
          >
            Ver {post.comments_count} comentario{(post.comments_count || 0) > 1 ? 's' : ''}
          </button>
        )}

        {/* Comments section */}
        {showComments && (
          <CommentSection
            postId={post.id}
            currentUserId={currentUserId}
            onClose={() => setShowComments(false)}
          />
        )}
      </div>
    </article>
  );
}

function HeartIcon({ className, filled }: { className?: string; filled?: boolean }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
    </svg>
  );
}

function CommentIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  );
}

function ShareIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
    </svg>
  );
}
