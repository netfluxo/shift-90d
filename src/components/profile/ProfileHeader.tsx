'use client';

import { useState, useRef } from 'react';
import Image from 'next/image';
import { User } from '@/lib/types';
import { createClient } from '@/lib/supabase/client';

interface ProfileHeaderProps {
  user: User;
  postsCount: number;
  isOwnProfile: boolean;
  onLogout?: () => void;
  onProfileUpdate?: () => void;
}

export default function ProfileHeader({
  user,
  postsCount,
  isOwnProfile,
  onLogout,
  onProfileUpdate,
}: ProfileHeaderProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(user.name);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    const supabase = createClient();

    // Upload avatar
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

    // Get public URL with cache-busting param
    const { data: { publicUrl } } = supabase.storage
      .from('avatars')
      .getPublicUrl(fileName);
    const avatarUrl = `${publicUrl}?t=${Date.now()}`;

    // Update user profile
    const { error: updateError } = await supabase
      .from('users')
      .update({ avatar_url: avatarUrl })
      .eq('id', user.id);

    if (updateError) {
      console.error('Update error:', updateError);
    } else {
      onProfileUpdate?.();
    }

    setLoading(false);
  };

  const handleNameUpdate = async () => {
    if (name === user.name || !name.trim()) {
      setIsEditing(false);
      return;
    }

    setLoading(true);
    const supabase = createClient();

    // Update public.users table
    const { error } = await supabase
      .from('users')
      .update({ name: name.trim() })
      .eq('id', user.id);

    // Update auth.users metadata (display_name + name + full_name)
    await supabase.auth.updateUser({
      data: {
        name: name.trim(),
        full_name: name.trim(),
        display_name: name.trim(),
      },
    });

    if (!error) {
      onProfileUpdate?.();
    }

    setIsEditing(false);
    setLoading(false);
  };

  return (
    <div className="px-4 py-6 border-b border-gray-100">
      <div className="flex items-start gap-6">
        {/* Avatar */}
        <div className="relative">
          <div
            onClick={() => isOwnProfile && fileInputRef.current?.click()}
            className={`w-20 h-20 rounded-full bg-gray-200 overflow-hidden ${
              isOwnProfile ? 'cursor-pointer' : ''
            }`}
          >
            {user.avatar_url ? (
              <Image
                src={user.avatar_url}
                alt={user.name}
                width={80}
                height={80}
                className="object-cover w-full h-full"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-primary text-white font-bold text-2xl">
                {user.name.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          {isOwnProfile && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarChange}
                className="hidden"
              />
              <div className="absolute -bottom-1 -right-1 w-7 h-7 bg-primary rounded-full flex items-center justify-center">
                <CameraIcon className="w-4 h-4 text-white" />
              </div>
            </>
          )}
        </div>

        {/* Stats */}
        <div className="flex-1">
          <div className="flex gap-6 mb-3">
            <div className="text-center">
              <p className="font-bold text-lg">{postsCount}</p>
              <p className="text-xs text-gray-500">posts</p>
            </div>
            <div className="text-center">
              <p className="font-bold text-lg text-primary">{user.points.toLocaleString('pt-BR')}</p>
              <p className="text-xs text-gray-500">pontos</p>
            </div>
          </div>
        </div>
      </div>

      {/* Name */}
      <div className="mt-4">
        {isEditing ? (
          <div className="flex gap-2">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="flex-1 border border-gray-200 rounded px-3 py-1 outline-none focus:border-primary"
              autoFocus
            />
            <button
              onClick={handleNameUpdate}
              disabled={loading}
              className="text-primary font-semibold"
            >
              Salvar
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-lg">{user.name}</h2>
            {isOwnProfile && (
              <button onClick={() => setIsEditing(true)}>
                <EditIcon className="w-4 h-4 text-gray-400" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Logout button */}
      {isOwnProfile && onLogout && (
        <button
          onClick={onLogout}
          className="mt-4 w-full py-2 border border-gray-300 rounded-lg text-gray-600 font-medium hover:bg-gray-50 transition"
        >
          Sair da conta
        </button>
      )}
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

function EditIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
    </svg>
  );
}
