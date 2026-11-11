-- Script 04: Adicionar coluna codigo (MP + 8 digitos) na tabela itens
ALTER TABLE public.itens
ADD COLUMN IF NOT EXISTS codigo text unique;
