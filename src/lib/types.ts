export interface User {
  id: string;
  name: string;
  avatar_url: string | null;
  points: number;
  created_at: string;
}

export interface Post {
  id: string;
  user_id: string;
  media_url: string;
  media_type: 'image' | 'video';
  caption: string;
  created_at: string;
  user?: User;
  likes_count?: number;
  comments_count?: number;
  is_liked?: boolean;
}

export interface Like {
  id: string;
  user_id: string;
  post_id: string;
  created_at: string;
}

export interface Comment {
  id: string;
  user_id: string;
  post_id: string;
  content: string;
  created_at: string;
  user?: User;
}

export interface Database {
  public: {
    Tables: {
      users: {
        Row: User;
        Insert: Omit<User, 'created_at'>;
        Update: Partial<Omit<User, 'id' | 'created_at'>>;
      };
      posts: {
        Row: Post;
        Insert: Omit<Post, 'id' | 'created_at'>;
        Update: Partial<Omit<Post, 'id' | 'user_id' | 'created_at'>>;
      };
      likes: {
        Row: Like;
        Insert: Omit<Like, 'id' | 'created_at'>;
        Update: never;
      };
      comments: {
        Row: Comment;
        Insert: Omit<Comment, 'id' | 'created_at'>;
        Update: Partial<Omit<Comment, 'id' | 'user_id' | 'post_id' | 'created_at'>>;
      };
    };
  };
}
