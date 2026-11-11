-- 08. Ordens de Produção (O.P.) com reserva de estoque e controle de perdas
CREATE TABLE IF NOT EXISTS public.ordens_producao (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.usuarios(id) ON DELETE CASCADE NOT NULL,
    receita_id UUID REFERENCES public.receitas(id) ON DELETE CASCADE NOT NULL,
    quantidade_planejada NUMERIC(12,3) NOT NULL CHECK (quantidade_planejada > 0),
    status TEXT NOT NULL DEFAULT 'EM_ANDAMENTO' CHECK (status IN ('EM_ANDAMENTO', 'CONCLUIDA', 'CANCELADA')),
    custo_acumulado NUMERIC(14,4) DEFAULT 0 NOT NULL,
    rendimento_real NUMERIC(12,3),
    perdas_finais NUMERIC(14,4) DEFAULT 0 NOT NULL,
    observacao TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    encerrada_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS public.ordem_itens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ordem_id UUID REFERENCES public.ordens_producao(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES public.usuarios(id) ON DELETE CASCADE NOT NULL,
    item_id UUID REFERENCES public.itens(id) ON DELETE CASCADE NOT NULL,
    quantidade_reservada NUMERIC(12,3) NOT NULL CHECK (quantidade_reservada >= 0),
    quantidade_perdida NUMERIC(12,3) DEFAULT 0 NOT NULL CHECK (quantidade_perdida >= 0),
    custo_unitario NUMERIC(14,4) DEFAULT 0 NOT NULL,
    UNIQUE (ordem_id, item_id)
);

CREATE TABLE IF NOT EXISTS public.ordem_perdas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ordem_id UUID REFERENCES public.ordens_producao(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES public.usuarios(id) ON DELETE CASCADE NOT NULL,
    item_id UUID REFERENCES public.itens(id) ON DELETE SET NULL,
    quantidade NUMERIC(12,3) DEFAULT 0 NOT NULL,
    custo NUMERIC(14,4) DEFAULT 0 NOT NULL,
    descricao TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.ordens_producao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ordem_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ordem_perdas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir acesso total ordens_producao" ON public.ordens_producao;
CREATE POLICY "Permitir acesso total ordens_producao" ON public.ordens_producao FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir acesso total ordem_itens" ON public.ordem_itens;
CREATE POLICY "Permitir acesso total ordem_itens" ON public.ordem_itens FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir acesso total ordem_perdas" ON public.ordem_perdas;
CREATE POLICY "Permitir acesso total ordem_perdas" ON public.ordem_perdas FOR ALL USING (true) WITH CHECK (true);