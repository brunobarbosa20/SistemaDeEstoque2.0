-- Script 03: Alterações (adicionar display_name na tabela usuarios)
ALTER TABLE public.usuarios
ADD COLUMN IF NOT EXISTS display_name text;
