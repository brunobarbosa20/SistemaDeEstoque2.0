-- Habilitar RLS (Row Level Security) em todas as tabelas
alter table public.usuarios enable row level security;
alter table public.itens enable row level security;
alter table public.historico enable row level security;

-- Políticas permissivas simples para acesso autenticado/anônimo conforme modelo leve solicitado
create policy "Permitir acesso total usuarios" on public.usuarios for all using (true) with check (true);
create policy "Permitir acesso total itens" on public.itens for all using (true) with check (true);
create policy "Permitir acesso total historico" on public.historico for all using (true) with check (true);