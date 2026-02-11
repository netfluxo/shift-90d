'use client';

import BottomNav from '@/components/layout/BottomNav';
import Header from '@/components/layout/Header';
import CreatePost from '@/components/post/CreatePost';
import PostCard from '@/components/post/PostCard';
import { Post } from '@/lib/types';
import { useRouter } from 'next/navigation';
import { useState, useEffect, useRef, useCallback } from 'react';

interface FeedClientProps {
  posts: Post[];
  currentUserId: string;
  hasMore: boolean;
}

export default function FeedClient({ posts: initialPosts, currentUserId, hasMore: initialHasMore }: FeedClientProps) {
  const router = useRouter();
  const [posts, setPosts] = useState<Post[]>(initialPosts);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1); // page 0 was loaded by the server
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Reset state when server props change (e.g. after router.refresh())
  useEffect(() => {
    setPosts(initialPosts);
    setHasMore(initialHasMore);
    setPage(1);
  }, [initialPosts, initialHasMore]);

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    setLoading(true);

    try {
      const res = await fetch(`/api/posts/feed?page=${page}&limit=10`);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();

      setPosts((prev) => {
        const existingIds = new Set(prev.map((p) => p.id));
        const newPosts = data.posts.filter((p: Post) => !existingIds.has(p.id));
        return [...prev, ...newPosts];
      });
      setHasMore(data.hasMore);
      setPage((prev) => prev + 1);
    } catch (error) {
      console.error('Error loading more posts:', error);
    } finally {
      setLoading(false);
    }
  }, [loading, hasMore, page]);

  // IntersectionObserver for infinite scroll
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMore();
        }
      },
      { rootMargin: '200px' }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore]);

  const handlePostCreated = () => {
    router.refresh();
  };

  return (
    <div className="pb-5">
      {/* Header */}
      <Header />

      {/* Feed */}
      <div>
        {posts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <CameraIcon className="w-10 h-10 text-gray-400" />
            </div>
            <h2 className="text-lg font-semibold text-gray-800 mb-2">Nenhum post ainda</h2>
            <p className="text-gray-500">Seja o primeiro a compartilhar seu treino!</p>
          </div>
        ) : (
          posts.map((post) => (
            <PostCard key={post.id} post={post} currentUserId={currentUserId} />
          ))
        )}
      </div>

      {/* Sentinel for infinite scroll */}
      <div ref={sentinelRef} className="h-1" />

      {/* Loading spinner */}
      {loading && (
        <div className="flex justify-center py-4">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      )}

      {/* Create Post Button */}
      <CreatePost userId={currentUserId} onPostCreated={handlePostCreated} />

      {/* Bottom Navigation */}
      <BottomNav />
    </div>
  );
}

function CameraIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}
