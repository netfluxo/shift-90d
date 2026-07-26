import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getAuth } from '@/lib/auth/server';
import { getUserById, getRanking } from '@/lib/db/queries/users';
import { getUserPosts } from '@/lib/db/queries/posts';
import { getUserActivity } from '@/lib/db/queries/point-events';
import { buildDenseRankingMap } from '@/lib/utils/ranking';
import ProfileClient from './ProfileClient';

export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    redirect('/login');
  }

  const userId = session.user.id;

  // Ranking é buscado uma única vez e reaproveitado por getUserPosts e pela
  // posição do usuário — antes cada um recomputava a agregação global.
  const [userWithPoints, ranking, activity] = await Promise.all([
    getUserById(userId),
    getRanking(100),
    getUserActivity(userId),
  ]);

  if (!userWithPoints) {
    // User should exist via Better Auth seed, but if not, error
    console.error(`User profile not found for ${userId}`);
    redirect('/login');
  }

  const feedPosts = await getUserPosts(userId, userId, ranking);

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

  const activityStats = {
    total_active_days: activity.totalActiveDays,
    current_streak: activity.currentStreak,
    total_points: activity.totalPoints,
    today_posts: activity.todayPosts,
    today_points: activity.todayPoints,
  };

  const rankingMap = buildDenseRankingMap(
    ranking.map((u) => ({ id: u.id, points: u.points }))
  );
  const rankingPosition = rankingMap.get(userId) || 0;

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
      currentUserId={userId}
      isOwnProfile={true}
      activityStats={activityStats}
      rankingPosition={rankingPosition}
    />
  );
}
