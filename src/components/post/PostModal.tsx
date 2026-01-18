'use client';

import { Post } from '@/lib/types';
import Image from 'next/image';
import Link from 'next/link';
import PostContent from './PostContent';

interface PostModalProps {
  post: Post;
  currentUserId: string;
  onClose: () => void;
}

export default function PostModal({ post, currentUserId, onClose }: PostModalProps) {
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

  return (
    <div
      className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-lg shadow-xl animate-scale-in overflow-hidden max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-100 shrink-0">
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
              <p className="font-semibold text-gray-900">{post.user?.name || 'Usuario'}</p>
              <p className="text-xs text-gray-500">{formatDate(post.created_at)}</p>
            </div>
          </Link>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center transition"
          >
            <CloseIcon className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="overflow-y-auto flex-1">
          <PostContent post={post} currentUserId={currentUserId} compact />
        </div>
      </div>
    </div>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}
