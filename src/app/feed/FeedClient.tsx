'use client';

import BottomNav from '@/components/layout/BottomNav';
import Header from '@/components/layout/Header';
import CreatePost from '@/components/post/CreatePost';
import PostCard from '@/components/post/PostCard';
import { Post } from '@/lib/types';
import { useRouter } from 'next/navigation';

interface FeedClientProps {
  posts: Post[];
  currentUserId: string;
}

export default function FeedClient({ posts, currentUserId }: FeedClientProps) {
  const router = useRouter();

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
