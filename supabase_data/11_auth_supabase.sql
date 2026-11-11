-- 11. Migração para Supabase Auth (usuário único, sem cadastro público)
--
-- ATENÇÃO: este script APAGA TODOS OS DADOS das tabelas do sistema
-- (itens, histórico, receitas, ordens, vendas...). Use somente porque o
-- sistema vai recomeçar do zero. Não há como desfazer depois do COMMIT.
--
-- Antes de executar:
--   1. Confirme que o projeto aberto no painel é o mesmo da SUPABASE_URL do script.js.
--   2. Execute UMA vez, no SQL Editor do Supabase.
-- Depois de executar:
--   3. Desative o cadastro público (Authentication > Sign In / Providers).
--   4. Crie o usuário (veja GUIA_USUARIO_SUPABASE.txt).

BEGIN;

-- 1) Zerar os dados (necessário para trocar a referência de user_id)
TRUNCATE TABLE
    public.venda_adicionais,
    public.venda_itens,
    public.vendas,
    public.ordem_perdas,
    public.ordem_itens,
    public.ordens_producao,
    public.receita_itens,
    public.receitas,
    public.historico,
    public.itens
CASCADE;

-- 2) Remover a tabela antiga de usuários (senha em texto puro).
--    O CASCADE derruba apenas as chaves estrangeiras que apontavam para ela.
DROP TABLE IF EXISTS public.usuarios CASCADE;

-- 3) user_id passa a apontar para auth.users.
--    ON DELETE RESTRICT: apagar o usuário por engano é BLOQUEADO enquanto
--    houver dados dele (antes, o CASCADE apagaria tudo junto).
DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'itens', 'historico', 'receitas', 'receita_itens', 'ordens_producao',
        'ordem_itens', 'ordem_perdas', 'vendas', 'venda_itens', 'venda_adicionais'
    ] LOOP
        EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', t, t || '_user_id_fkey');
        EXECUTE format(
            'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE RESTRICT',
            t, t || '_user_id_fkey'
        );
    END LOOP;
END $$;

-- 4) Policies: cada usuário só enxerga e altera as próprias linhas.
--    Sem login válido (anon), a API não devolve nada.
DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'itens', 'historico', 'receitas', 'receita_itens', 'ordens_producao',
        'ordem_itens', 'ordem_perdas', 'vendas', 'venda_itens', 'venda_adicionais'
    ] LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Permitir acesso total ' || t, t);
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Acesso somente do proprio usuario', t);
        EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id)',
            'Acesso somente do proprio usuario', t
        );
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', t);
    END LOOP;
END $$;

-- 5) Funções RPC: só para usuário logado (anon não pode chamar)
DO $$
DECLARE
    f RECORD;
BEGIN
    FOR f IN
        SELECT p.oid::regprocedure AS assinatura
        FROM pg_proc AS p
        JOIN pg_namespace AS n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname IN ('salvar_receita', 'registrar_producao', 'registrar_venda')
    LOOP
        EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', f.assinatura);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f.assinatura);
    END LOOP;
END $$;

COMMIT;

-- Conferência (opcional): deve listar 1 policy por tabela, todas "authenticated".
-- SELECT tablename, policyname, roles, cmd
-- FROM pg_policies
-- WHERE schemaname = 'public'
-- ORDER BY tablename;
