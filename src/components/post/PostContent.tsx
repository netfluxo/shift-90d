'use client';

import { Post } from '@/lib/types';
import Image from 'next/image';
import { useState } from 'react';
import CommentSection from './CommentSection';

interface PostContentProps {
  post: Post;
  currentUserId: string;
  compact?: boolean;
}

export default function PostContent({ post, currentUserId, compact = false }: PostContentProps) {
  const [isLiked, setIsLiked] = useState(post.is_liked || false);
  const [likesCount, setLikesCount] = useState(post.likes_count || 0);
  const [showComments, setShowComments] = useState(false);
  const [isLiking, setIsLiking] = useState(false);

  const handleLike = async () => {
    if (isLiking) return;
    setIsLiking(true);

    // Optimistic UI update
    const previousIsLiked = isLiked;
    const previousLikesCount = likesCount;
    setIsLiked(!isLiked);
    setLikesCount((prev) => (isLiked ? prev - 1 : prev + 1));

    try {
      const response = await fetch('/api/likes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_id: post.id }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to toggle like');
      }

      // Update with server response
      setIsLiked(data.action === 'liked');
      setLikesCount(data.likes_count);
    } catch (error) {
      console.error('Error toggling like:', error);
      // Revert optimistic update on error
      setIsLiked(previousIsLiked);
      setLikesCount(previousLikesCount);
    }

    setIsLiking(false);
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Shift 90D',
          text: post.caption,
          url: window.location.href,
        });
      } catch (err) {
        console.log('Error sharing:', err);
      }
    }
  };

  // Generate an alt text for the image. If caption exists, use it; else, fallback to a generic description with username.
  const generateAltText = (post: Post) => {
    if (post.caption && post.caption.trim()) {
      return post.caption;
    } else if (post.user?.name) {
      return `Imagem publicada por ${post.user.name}`;
    }
    return 'Publicação do usuário no Shift 90D';
  };

  return (
    <>
      {/* Media */}
      <div className="relative bg-gray-100 overflow-hidden max-h-[125vw] flex items-center justify-center">
        {post.media_type === 'video' ? (
          <video
            src={post.media_url}
            controls
            autoPlay={compact}
            className="w-full"
            playsInline
          />
        ) : (
          <Image
            src={post.media_url}
            alt={generateAltText(post)}
            width={1080}
            height={1080}
            className="w-full h-auto object-contain"
            sizes="(max-width: 512px) 100vw, 512px"
          />
        )}
      </div>

      {/* Actions */}
      <div className={compact ? 'p-4 border-t border-gray-100' : 'p-3'}>
        <div className={`flex items-center gap-4 ${compact ? 'mb-3' : 'mb-2'}`}>
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
        <p className={`font-semibold text-sm ${compact ? 'mb-2' : 'mb-1'}`}>
          {likesCount} {likesCount === 1 ? 'curtida' : 'curtidas'}
        </p>

        {/* Caption */}
        {post.caption && (
          <p className={`text-sm ${compact ? 'mb-2' : ''}`}>
            <span className="font-semibold">{post.user?.name}</span> {post.caption}
          </p>
        )}

        {/* Comments toggle */}
        {(post.comments_count || 0) > 0 && !showComments && (
          <button
            onClick={() => setShowComments(true)}
            className={`text-gray-500 text-sm ${compact ? '' : 'mt-1'}`}
          >
            Ver {post.comments_count} comentario{(post.comments_count || 0) > 1 ? 's' : ''}
          </button>
        )}
      </div>

      {/* Comments section */}
      {showComments && (
        <div className={compact ? 'border-t border-gray-100 px-4 pb-4' : ''}>
          <CommentSection
            postId={post.id}
            currentUserId={currentUserId}
            onClose={() => setShowComments(false)}
          />
        </div>
      )}
    </>
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
