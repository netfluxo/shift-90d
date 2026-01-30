-- =============================================
-- Deletar todos os usuários do Auth do Supabase
-- Execute no SQL Editor do Supabase
-- =============================================

-- Primeiro limpa as tabelas públicas (por causa das foreign keys)
DELETE FROM public.comments;
DELETE FROM public.likes;
DELETE FROM public.posts;
DELETE FROM public.user_activity;
DELETE FROM public.users;

-- Deleta todos os usuários do módulo de Authentication
DELETE FROM auth.users;
