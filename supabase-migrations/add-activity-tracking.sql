-- Create user_activity table for tracking daily activity and points
CREATE TABLE IF NOT EXISTS user_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  activity_date DATE NOT NULL,
  posts_count INTEGER DEFAULT 0 NOT NULL,
  points_earned INTEGER DEFAULT 0 NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT user_activity_unique_user_date UNIQUE(user_id, activity_date)
);

-- Create indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_user_activity_user_date ON user_activity(user_id, activity_date DESC);
CREATE INDEX IF NOT EXISTS idx_user_activity_date ON user_activity(activity_date);

-- Enable Row Level Security
ALTER TABLE user_activity ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can view their own activity
CREATE POLICY "Users can view their own activity"
ON user_activity FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Users can view all users' activity (for leaderboard/ranking)
CREATE POLICY "Users can view all activity for ranking"
ON user_activity FOR SELECT
TO authenticated
USING (true);

-- Only the system can insert/update activity records (through API routes)
-- No direct insert/update policies for users

COMMENT ON TABLE user_activity IS 'Tracks user daily activity and points earned';
COMMENT ON COLUMN user_activity.activity_date IS 'Date in Brazil timezone (America/Sao_Paulo)';
COMMENT ON COLUMN user_activity.posts_count IS 'Number of posts created on this date';
COMMENT ON COLUMN user_activity.points_earned IS 'Points earned on this date (max 3 per day)';
