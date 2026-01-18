'use client';

import { useRouter } from 'next/navigation';
import { User, Post } from '@/lib/types';
import { createClient } from '@/lib/supabase/client';
import ProfileHeader from '@/components/profile/ProfileHeader';
import PostCard from '@/components/post/PostCard';
import BottomNav from '@/components/layout/BottomNav';

interface ProfileClientProps {
  user: User;
  posts: Post[];
  currentUserId: string;
  isOwnProfile: boolean;
}

export default function ProfileClient({
  user,
  posts,
  currentUserId,
  isOwnProfile,
}: ProfileClientProps) {
  const router = useRouter();

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  const handleProfileUpdate = () => {
    router.refresh();
  };

  return (
    <div className="pb-20">
      {/* Header */}
      <header className="sticky top-0 bg-white border-b border-gray-100 z-40">
        <div className="px-4 py-3">
          <h1 className="text-xl font-bold">{isOwnProfile ? 'Meu Perfil' : user.name}</h1>
        </div>
      </header>

      {/* Profile Header */}
      <ProfileHeader
        user={user}
        postsCount={posts.length}
        isOwnProfile={isOwnProfile}
        onLogout={isOwnProfile ? handleLogout : undefined}
        onProfileUpdate={handleProfileUpdate}
      />

      {/* User's Posts */}
      <div>
        <h3 className="px-4 py-3 font-semibold text-gray-800 border-b border-gray-100">
          Publicacoes
        </h3>

        {posts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-3">
              <GridIcon className="w-8 h-8 text-gray-400" />
            </div>
            <p className="text-gray-500">
              {isOwnProfile ? 'Voce ainda nao postou nada' : 'Nenhuma publicacao ainda'}
            </p>
          </div>
        ) : (
          posts.map((post) => (
            <PostCard key={post.id} post={post} currentUserId={currentUserId} />
          ))
        )}
      </div>

      {/* Bottom Navigation */}
      <BottomNav />
    </div>
  );
}

function GridIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
    </svg>
  );
}
