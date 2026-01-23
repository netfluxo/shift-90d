'use client';

import BottomNav from '@/components/layout/BottomNav';
import Header from '@/components/layout/Header';
import PostModal from '@/components/post/PostModal';
import { createClient } from '@/lib/supabase/client';
import { Post, User } from '@/lib/types';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';

interface ActivityStats {
  total_active_days: number;
  current_streak: number;
  total_points: number;
  today_posts: number;
  today_points: number;
}

interface ProfileClientProps {
  user: User;
  posts: Post[];
  currentUserId: string;
  isOwnProfile: boolean;
  activityStats?: ActivityStats; // <-- make optional
  rankingPosition?: number;
}

export default function ProfileClient({
  user,
  posts,
  currentUserId,
  isOwnProfile,
  activityStats,
  rankingPosition,
}: ProfileClientProps) {
  const router = useRouter();
  const [name, setName] = useState(user.name);
  const [loading, setLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showNameModal, setShowNameModal] = useState(false);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    const supabase = createClient();

    const fileExt = file.name.split('.').pop();
    const fileName = `${user.id}/avatar.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(fileName, file, { upsert: true });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      setLoading(false);
      return;
    }

    const { data: { publicUrl } } = supabase.storage
      .from('avatars')
      .getPublicUrl(fileName);

    const { error: updateError } = await supabase
      .from('users')
      .update({ avatar_url: publicUrl })
      .eq('id', user.id);

    if (!updateError) {
      router.refresh();
    }

    setLoading(false);
  };

  const handleNameUpdate = async () => {
    if (name === user.name || !name.trim()) {
      setShowNameModal(false);
      return;
    }

    setLoading(true);
    const supabase = createClient();

    const { error } = await supabase
      .from('users')
      .update({ name: name.trim() })
      .eq('id', user.id);

    if (!error) {
      router.refresh();
    }

    setShowNameModal(false);
    setLoading(false);
  };

  const openNameModal = () => {
    setName(user.name);
    setShowNameModal(true);
    setShowSettings(false);
  };

  // Provide default values if activityStats is undefined to prevent runtime errors
  const activityStatsSafe: ActivityStats = {
    total_active_days: activityStats?.total_active_days ?? 0,
    current_streak: activityStats?.current_streak ?? 0,
    total_points: activityStats?.total_points ?? 0,
    today_posts: activityStats?.today_posts ?? 0,
    today_points: activityStats?.today_points ?? 0,
  };

  return (
    <div className="pb-20 min-h-screen">
      {/* Header */}
      <Header subtitle="Perfil" />

      {/* Profile Card */}
      <div className="bg-white/95 backdrop-blur-sm mx-4 mt-4 rounded-2xl shadow-sm border border-gray-100">
        {/* User Info Section */}
        <div className="p-5">
          <div className="flex items-center gap-4">
            {/* Avatar with ring and ranking badge */}
            <div className="relative">
              <div
                onClick={() => isOwnProfile && fileInputRef.current?.click()}
                className={`w-24 h-24 rounded-full p-1 ${
                  rankingPosition === 1
                    ? 'bg-linear-to-br from-yellow-400 to-yellow-600'
                    : rankingPosition === 2
                      ? 'bg-linear-to-br from-gray-300 to-gray-500'
                      : rankingPosition === 3
                        ? 'bg-linear-to-br from-amber-600 to-amber-800'
                        : 'bg-linear-to-br from-primary-light to-primary'
                } ${isOwnProfile ? 'cursor-pointer' : ''}`}
              >
                <div className="w-full h-full rounded-full bg-white p-0.5">
                  <div className="w-full h-full rounded-full overflow-hidden bg-gray-200">
                    {user.avatar_url ? (
                      <Image
                        src={user.avatar_url}
                        alt={user.name}
                        width={96}
                        height={96}
                        className="object-cover w-full h-full"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-primary text-white font-bold text-3xl">
                        {user.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              {/* Ranking position badge */}
              {rankingPosition && rankingPosition > 0 && (
                <div
                  className={`absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full w-8 h-8 flex items-center justify-center shadow-md ${
                    rankingPosition === 1
                      ? 'bg-linear-to-br from-yellow-400 to-yellow-600'
                      : rankingPosition === 2
                        ? 'bg-linear-to-br from-gray-300 to-gray-500'
                        : rankingPosition === 3
                          ? 'bg-linear-to-br from-amber-600 to-amber-800'
                          : 'bg-primary-light'
                  }`}
                >
                  <span className="text-sm font-bold text-white drop-shadow-sm">#{rankingPosition}</span>
                </div>
              )}
              {isOwnProfile && (
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarChange}
                  className="hidden"
                />
              )}
            </div>

            {/* Name and Points */}
            <div className="flex-1">
              <h2 className="font-bold text-xl text-gray-900">{user.name}</h2>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-2xl font-bold text-primary-light">
                  {user.points.toLocaleString('pt-BR')}
                </span>
                <span className="text-gray-500 text-sm">pontos</span>
              </div>
            </div>

            {/* Settings button */}
            {isOwnProfile && (
              <button
                onClick={() => setShowSettings(!showSettings)}
                className="w-11 h-11 rounded-full border border-gray-200 flex items-center justify-center hover:bg-gray-50 transition"
              >
                <SettingsIcon className="w-5 h-5 text-gray-500" />
              </button>
            )}
          </div>
        </div>

        {/* Stats Row */}
        <div className="border-t border-gray-100">
          <div className="grid grid-cols-3 divide-x divide-gray-100">
            <div className="py-4 text-center">
              <p className="font-bold text-xl text-gray-900">{posts.length}</p>
              <p className="text-xs text-gray-500 mt-0.5">Publicações</p>
            </div>
            <div className="py-4 text-center">
              <p className="font-bold text-xl text-gray-900">{activityStatsSafe.total_active_days}</p>
              <p className="text-xs text-gray-500 mt-0.5">Dias ativos</p>
            </div>
            <div className="py-4 text-center">
              <p className="font-bold text-xl text-gray-900">{activityStatsSafe.current_streak}</p>
              <p className="text-xs text-gray-500 mt-0.5">Sequência</p>
            </div>
          </div>
        </div>
      </div>

      {/* Settings Dropdown */}
      {showSettings && isOwnProfile && (
        <div className="bg-white/95 backdrop-blur-sm mx-4 mt-2 rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <button
            onClick={openNameModal}
            className="w-full px-4 py-3 text-left text-gray-700 hover:bg-gray-50 transition flex items-center gap-3 border-b border-gray-100"
          >
            <EditIcon className="w-5 h-5 text-gray-400" />
            Editar nome
          </button>
          <button
            onClick={() => {
              fileInputRef.current?.click();
              setShowSettings(false);
            }}
            className="w-full px-4 py-3 text-left text-gray-700 hover:bg-gray-50 transition flex items-center gap-3 border-b border-gray-100"
          >
            <CameraIcon className="w-5 h-5 text-gray-400" />
            Alterar foto
          </button>
          <button
            onClick={handleLogout}
            className="w-full px-4 py-3 text-left text-secondary hover:bg-red-50 transition flex items-center gap-3"
          >
            <LogoutIcon className="w-5 h-5" />
            Sair da conta
          </button>
        </div>
      )}

      {/* User's Posts Section */}
      <div className="bg-white/95 backdrop-blur-sm mx-4 mt-4 rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <h3 className="px-4 py-3 font-bold text-sm text-gray-700 uppercase tracking-wide border-b border-gray-100">
          Suas Publicações
        </h3>

        {posts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-3">
              <GridIcon className="w-8 h-8 text-gray-400" />
            </div>
            <p className="text-gray-500">
              {isOwnProfile ? 'Você ainda não postou nada' : 'Nenhuma publicação ainda'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2 p-3">
            {posts.map((post) => (
              <button
                key={post.id}
                onClick={() => setSelectedPost(post)}
                className="aspect-square relative bg-gray-100 rounded-lg overflow-hidden"
              >
                {post.media_type === 'video' ? (
                  <video
                    src={post.media_url}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Image
                    src={post.media_url}
                    alt={post.caption || 'Foto de perfil'}
                    fill
                    className="object-cover"
                    sizes="(max-width: 512px) 33vw, 170px"
                  />
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Post Detail Modal */}
      {selectedPost && (
        <PostModal
          post={selectedPost}
          currentUserId={currentUserId}
          onClose={() => setSelectedPost(null)}
        />
      )}

      {/* Edit Name Modal */}
      {showNameModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl animate-scale-in">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <h3 className="text-lg font-bold text-gray-900">Editar nome</h3>
              <button
                onClick={() => setShowNameModal(false)}
                className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center transition"
              >
                <CloseIcon className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Seu nome
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Digite seu nome"
                className="w-full border border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 text-lg transition"
                autoFocus
              />
            </div>

            {/* Modal Footer */}
            <div className="flex gap-3 p-4 border-t border-gray-100">
              <button
                onClick={() => setShowNameModal(false)}
                className="flex-1 py-3 rounded-xl border border-gray-200 font-semibold text-gray-600 hover:bg-gray-50 transition"
              >
                Cancelar
              </button>
              <button
                onClick={handleNameUpdate}
                disabled={loading || !name.trim()}
                className="flex-1 py-3 rounded-xl bg-primary font-semibold text-white hover:bg-primary-dark transition disabled:opacity-50"
              >
                {loading ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Loading overlay */}
      {loading && !showNameModal && (
        <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-4 shadow-lg">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        </div>
      )}

      {/* Bottom Navigation */}
      <div className={selectedPost ? 'hidden' : ''}>
        <BottomNav />
      </div>
    </div>
  );
}

function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a6.759 6.759 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
    </svg>
  );
}

function GridIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
    </svg>
  );
}

function EditIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
    </svg>
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

function LogoutIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}
