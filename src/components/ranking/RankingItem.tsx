'use client';

import Image from 'next/image';
import Link from 'next/link';
import { User } from '@/lib/types';

interface RankingItemProps {
  user: User & { active_days?: number };
  position: number;
}

export default function RankingItem({ user, position }: RankingItemProps) {
  const getPositionStyle = () => {
    switch (position) {
      case 1:
        return {
          badgeBg: 'bg-yellow-400',
          badgeText: 'text-white',
          avatarRing: 'ring-4 ring-yellow-400',
          labelColor: 'text-yellow-600',
          pointsColor: 'text-yellow-600',
        };
      case 2:
        return {
          badgeBg: 'bg-gray-400',
          badgeText: 'text-white',
          avatarRing: 'ring-4 ring-gray-400',
          labelColor: 'text-gray-500',
          pointsColor: 'text-gray-500',
        };
      case 3:
        return {
          badgeBg: 'bg-orange-400',
          badgeText: 'text-white',
          avatarRing: 'ring-4 ring-orange-400',
          labelColor: 'text-orange-500',
          pointsColor: 'text-orange-500',
        };
      default:
        return null;
    }
  };

  const style = getPositionStyle();
  const isTopThree = position <= 3;

  return (
    <Link href={`/profile/${user.id}`}>
      <div className="mx-4 my-3 bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
        <div className="flex items-center gap-4 p-4">
          {/* Position Badge / Number */}
          <div className="shrink-0 w-12 flex justify-center">
            {isTopThree && style ? (
              <div className={`w-11 h-11 rounded-full ${style.badgeBg} flex items-center justify-center shadow-md`}>
                <TrophyIcon className={`w-6 h-6 ${style.badgeText}`} />
              </div>
            ) : (
              <span className="text-2xl font-bold text-gray-400">{position}</span>
            )}
          </div>

          {/* Avatar */}
          <div className={`shrink-0 w-14 h-14 rounded-full overflow-hidden ${isTopThree && style ? style.avatarRing : 'ring-2 ring-gray-200'}`}>
            {user.avatar_url ? (
              <Image
                src={user.avatar_url}
                alt={user.name}
                width={56}
                height={56}
                className="object-cover w-full h-full"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-primary text-white font-bold text-xl">
                {user.name.charAt(0).toUpperCase()}
              </div>
            )}
          </div>

          {/* Name and Label */}
          <div className="flex-1 min-w-0">
            <p className="font-bold text-lg text-gray-900 truncate">
              {user.name}
            </p>
            {isTopThree && style && (
              <p className={`text-sm font-medium ${style.labelColor}`}>
                Top {position}
              </p>
            )}
          </div>

          {/* Points */}
          <div className="text-right shrink-0">
            <p className={`text-2xl font-bold ${isTopThree && style ? style.pointsColor : 'text-gray-700'}`}>
              {user.points.toLocaleString('pt-BR')}
            </p>
            <p className="text-sm text-gray-400">pontos</p>
          </div>
        </div>
      </div>
    </Link>
  );
}

function TrophyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94.63 1.5 1.98 2.63 3.61 2.96V19H7v2h10v-2h-4v-3.1c1.63-.33 2.98-1.46 3.61-2.96C19.08 12.63 21 10.55 21 8V7c0-1.1-.9-2-2-2zM5 8V7h2v3.82C5.84 10.4 5 9.3 5 8zm14 0c0 1.3-.84 2.4-2 2.82V7h2v1z"/>
    </svg>
  );
}
