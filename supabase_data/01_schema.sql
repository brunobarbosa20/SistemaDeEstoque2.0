-- 1. Criação da tabela de Usuários (simples por nome e senha conforme requisito)
create table if not exists public.usuarios (
  id uuid default gen_random_uuid() primary key,
  username text unique not null,
  senha text not null,
  display_name text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Criação da tabela de Itens do Estoque
create table if not exists public.itens (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.usuarios(id) on delete cascade not null,
  codigo text unique,
  titulo text not null,
  unidade text not null check (unidade in ('GR', 'UN', 'ML')),
  status text default 'SEM MOVIMENTAÇÕES' check (status in ('SEM MOVIMENTAÇÕES', 'COM MOVIMENTAÇÕES')),
  quantidade numeric default 0 not null,
  custo_medio numeric default 0 not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. Criação da tabela de Histórico (Entradas e Saídas)
create table if not exists public.historico (
  id uuid default gen_random_uuid() primary key,
  item_id uuid references public.itens(id) on delete cascade not null,
  user_id uuid references public.usuarios(id) on delete cascade not null,
  tipo text not null check (tipo in ('ENTRADA', 'SAIDA', 'CADASTRO')),
  quantidade numeric not null,
  valor_total numeric default 0 not null,
  custo_unitario numeric default 0 not null,
  observacao text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);