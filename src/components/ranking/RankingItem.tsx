'use client';

import Image from 'next/image';
import Link from 'next/link';
import { User } from '@/lib/types';

interface RankingItemProps {
  user: User;
  position: number;
}

export default function RankingItem({ user, position }: RankingItemProps) {
  const getMedal = () => {
    switch (position) {
      case 1:
        return { emoji: '🥇', bgColor: 'bg-yellow-100', borderColor: 'border-yellow-400' };
      case 2:
        return { emoji: '🥈', bgColor: 'bg-gray-100', borderColor: 'border-gray-400' };
      case 3:
        return { emoji: '🥉', bgColor: 'bg-orange-100', borderColor: 'border-orange-400' };
      default:
        return null;
    }
  };

  const medal = getMedal();
  const isTopThree = position <= 3;

  return (
    <Link href={`/profile/${user.id}`}>
      <div
        className={`flex items-center gap-4 p-4 ${
          medal ? `${medal.bgColor} border-l-4 ${medal.borderColor}` : 'bg-white border-b border-gray-100'
        } hover:bg-gray-50 transition`}
      >
        {/* Position */}
        <div className={`w-8 text-center font-bold ${isTopThree ? 'text-2xl' : 'text-lg text-gray-500'}`}>
          {medal ? medal.emoji : position}
        </div>

        {/* Avatar */}
        <div className={`${isTopThree ? 'w-14 h-14' : 'w-12 h-12'} rounded-full bg-gray-200 overflow-hidden flex-shrink-0`}>
          {user.avatar_url ? (
            <Image
              src={user.avatar_url}
              alt={user.name}
              width={isTopThree ? 56 : 48}
              height={isTopThree ? 56 : 48}
              className="object-cover w-full h-full"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-primary text-white font-bold text-lg">
              {user.name.charAt(0).toUpperCase()}
            </div>
          )}
        </div>

        {/* Name */}
        <div className="flex-1 min-w-0">
          <p className={`font-semibold truncate ${isTopThree ? 'text-lg' : 'text-base'}`}>
            {user.name}
          </p>
        </div>

        {/* Points */}
        <div className="text-right">
          <p className={`font-bold ${isTopThree ? 'text-xl text-primary' : 'text-lg text-gray-700'}`}>
            {user.points.toLocaleString('pt-BR')}
          </p>
          <p className="text-xs text-gray-500">pontos</p>
        </div>
      </div>
    </Link>
  );
}
