import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { getAuth } from '@/lib/auth/server';
import { getUserById, getRanking } from '@/lib/db/queries/users';
import { getUserPosts } from '@/lib/db/queries/posts';
import { getUserActivity } from '@/lib/db/queries/point-events';
import { buildDenseRankingMap } from '@/lib/utils/ranking';
import ProfileClient from '../ProfileClient';

interface Props {
  params: Promise<{ id: string }>;
}

export const dynamic = 'force-dynamic';

export default async function UserProfilePage({ params }: Props) {
  const { id } = await params;

  const auth = getAuth();
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    redirect('/login');
  }

  const currentUserId = session.user.id;

  // If viewing own profile, redirect to /profile
  if (id === currentUserId) {
    redirect('/profile');
  }

  // Fetch user profile
  const userWithPoints = await getUserById(id);

  if (!userWithPoints) {
    notFound();
  }

  // Fetch user's posts
  const feedPosts = await getUserPosts(id, currentUserId);

  // Convert FeedPost to Post shape for ProfileClient
  const posts = feedPosts.map((post) => ({
    id: post.id,
    user_id: post.userId,
    media_url: post.mediaUrl,
    media_type: post.mediaType,
    caption: post.caption,
    created_at: post.createdAt.toISOString(),
    user: {
      id: post.user.id,
      name: post.user.name,
      avatar_url: post.user.avatarUrl,
      points: 0,
      created_at: '',
    },
    likes_count: post.likesCount,
    comments_count: post.commentsCount,
    is_liked: post.isLiked,
    user_ranking: post.userRanking || 0,
  }));

  // Fetch activity stats for this user
  const activity = await getUserActivity(id);

  const activityStats = {
    total_active_days: activity.totalActiveDays,
    current_streak: activity.currentStreak,
    total_points: activity.totalPoints,
    today_posts: activity.todayPosts,
    today_points: activity.todayPoints,
  };

  // Get ranking position
  const ranking = await getRanking(100);
  const rankingMap = buildDenseRankingMap(
    ranking.map((u) => ({ id: u.id, points: u.points }))
  );
  const rankingPosition = rankingMap.get(id) || 0;

  // Convert UserWithPoints to User shape for ProfileClient
  const user = {
    id: userWithPoints.id,
    name: userWithPoints.name,
    avatar_url: userWithPoints.avatarUrl,
    points: userWithPoints.points,
    created_at: userWithPoints.createdAt.toISOString(),
  };

  return (
    <ProfileClient
      user={user}
      posts={posts}
      currentUserId={currentUserId}
      isOwnProfile={false}
      activityStats={activityStats}
      rankingPosition={rankingPosition}
    />
  );
}
