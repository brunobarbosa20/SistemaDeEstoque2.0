CREATE TABLE IF NOT EXISTS public.receitas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.usuarios(id) ON DELETE CASCADE NOT NULL,
    nome TEXT NOT NULL,
    rendimento INTEGER NOT NULL DEFAULT 1 CHECK (rendimento > 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS receitas_user_nome_unique
    ON public.receitas (user_id, lower(nome));

ALTER TABLE public.itens
    DROP CONSTRAINT IF EXISTS itens_status_check;
ALTER TABLE public.itens
    ADD CONSTRAINT itens_status_check CHECK (
        status IN ('SEM MOVIMENTAÇÕES', 'COM MOVIMENTAÇÕES', 'ATIVO NO ESTOQUE', 'CADASTRO PENDENTE')
    );
UPDATE public.itens
SET status = 'ATIVO NO ESTOQUE'
WHERE status = 'COM MOVIMENTAÇÕES';
UPDATE public.itens AS item
SET status = CASE WHEN EXISTS (
    SELECT 1
    FROM public.historico AS movement
    WHERE movement.item_id = item.id
      AND movement.user_id = item.user_id
      AND movement.tipo = 'ENTRADA'
) THEN 'ATIVO NO ESTOQUE' ELSE 'CADASTRO PENDENTE' END
WHERE item.quantidade = 0
  AND item.status = 'SEM MOVIMENTAÇÕES';

ALTER TABLE public.receitas
    DROP CONSTRAINT IF EXISTS receitas_rendimento_check;
ALTER TABLE public.receitas
    DROP CONSTRAINT IF EXISTS receitas_rendimento_positivo_check;
ALTER TABLE public.receitas
    ADD CONSTRAINT receitas_rendimento_positivo_check CHECK (rendimento > 0);

CREATE TABLE IF NOT EXISTS public.receita_itens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.usuarios(id) ON DELETE CASCADE NOT NULL,
    receita_id UUID REFERENCES public.receitas(id) ON DELETE CASCADE NOT NULL,
    item_id UUID REFERENCES public.itens(id) ON DELETE CASCADE NOT NULL,
    quantidade NUMERIC(12, 3) NOT NULL CHECK (quantidade > 0),
    UNIQUE (receita_id, item_id)
);

ALTER TABLE public.receitas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receita_itens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir acesso total receitas" ON public.receitas;
CREATE POLICY "Permitir acesso total receitas" ON public.receitas
    FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir acesso total receita_itens" ON public.receita_itens;
CREATE POLICY "Permitir acesso total receita_itens" ON public.receita_itens
    FOR ALL USING (true) WITH CHECK (true);

DROP FUNCTION IF EXISTS public.salvar_receita(UUID, UUID, TEXT, JSONB);

CREATE OR REPLACE FUNCTION public.salvar_receita(
    p_receita_id UUID,
    p_user_id UUID,
    p_nome TEXT,
    p_rendimento INTEGER,
    p_itens JSONB
) RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
    v_receita_id UUID;
    v_item_id UUID;
BEGIN
    IF p_user_id IS NULL OR NULLIF(trim(p_nome), '') IS NULL
       OR p_rendimento IS NULL OR p_rendimento <= 0 THEN
        RAISE EXCEPTION 'Informe o usuário, o nome da receita e um rendimento maior que zero.';
    END IF;
    IF jsonb_typeof(p_itens) IS DISTINCT FROM 'array' OR jsonb_array_length(p_itens) = 0 THEN
        RAISE EXCEPTION 'A receita precisa ter ao menos um insumo.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM jsonb_to_recordset(p_itens) AS row_data(item_id UUID, quantidade NUMERIC)
        WHERE row_data.item_id IS NULL OR row_data.quantidade IS NULL OR row_data.quantidade <= 0
    ) THEN
        RAISE EXCEPTION 'Os insumos e suas quantidades devem ser válidos.';
    END IF;

    SELECT row_data.item_id INTO v_item_id
    FROM jsonb_to_recordset(p_itens) AS row_data(item_id UUID, quantidade NUMERIC)
    LEFT JOIN public.itens AS item
        ON item.id = row_data.item_id AND item.user_id = p_user_id
    WHERE item.id IS NULL
    LIMIT 1;
    IF FOUND THEN
        RAISE EXCEPTION 'Um dos insumos não pertence ao usuário atual.';
    END IF;

    IF p_receita_id IS NULL THEN
        INSERT INTO public.receitas (user_id, nome, rendimento)
        VALUES (p_user_id, trim(p_nome), p_rendimento)
        RETURNING id INTO v_receita_id;
    ELSE
        UPDATE public.receitas
        SET nome = trim(p_nome), rendimento = p_rendimento
        WHERE id = p_receita_id AND user_id = p_user_id
        RETURNING id INTO v_receita_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Receita não encontrada para este usuário.';
        END IF;
    END IF;

    DELETE FROM public.receita_itens
    WHERE receita_id = v_receita_id AND user_id = p_user_id;

    INSERT INTO public.receita_itens (user_id, receita_id, item_id, quantidade)
    SELECT p_user_id, v_receita_id, row_data.item_id, row_data.quantidade
    FROM jsonb_to_recordset(p_itens) AS row_data(item_id UUID, quantidade NUMERIC);

    RETURN v_receita_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.registrar_producao(
    p_user_id UUID,
    p_receita_id UUID,
    p_quantidade INTEGER
) RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    v_nome_receita TEXT;
    v_rendimento INTEGER;
    v_insumo RECORD;
BEGIN
    IF p_quantidade IS NULL OR p_quantidade <= 0 THEN
        RAISE EXCEPTION 'A quantidade produzida deve ser um inteiro maior que zero.';
    END IF;

    SELECT nome, rendimento INTO v_nome_receita, v_rendimento
    FROM public.receitas
    WHERE id = p_receita_id AND user_id = p_user_id
    FOR SHARE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Receita não encontrada para este usuário.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.receita_itens
        WHERE receita_id = p_receita_id AND user_id = p_user_id
    ) THEN
        RAISE EXCEPTION 'A receita não possui insumos cadastrados.';
    END IF;

    PERFORM item.id
    FROM public.itens AS item
    JOIN public.receita_itens AS recipe_item ON recipe_item.item_id = item.id
    WHERE recipe_item.receita_id = p_receita_id
      AND recipe_item.user_id = p_user_id
      AND item.user_id = p_user_id
    ORDER BY item.id
    FOR UPDATE OF item;

    FOR v_insumo IN
        SELECT item.id, item.titulo, item.unidade, item.quantidade AS saldo,
               item.status,
               item.custo_medio,
               recipe_item.quantidade / v_rendimento * p_quantidade AS necessario
        FROM public.receita_itens AS recipe_item
        JOIN public.itens AS item ON item.id = recipe_item.item_id
        WHERE recipe_item.receita_id = p_receita_id
          AND recipe_item.user_id = p_user_id
          AND item.user_id = p_user_id
        ORDER BY item.id
    LOOP
        IF v_insumo.status = 'CADASTRO PENDENTE' OR v_insumo.saldo < v_insumo.necessario THEN
            RAISE EXCEPTION 'Produção não permitida: O ingrediente % possui apenas % % em estoque (necessário: % %). Faça a entrada/compra deste item primeiro.',
                v_insumo.titulo, v_insumo.saldo, v_insumo.unidade,
                v_insumo.necessario, v_insumo.unidade;
        END IF;
    END LOOP;

    FOR v_insumo IN
        SELECT item.id, item.quantidade AS saldo, item.custo_medio,
               recipe_item.quantidade / v_rendimento * p_quantidade AS necessario
        FROM public.receita_itens AS recipe_item
        JOIN public.itens AS item ON item.id = recipe_item.item_id
        WHERE recipe_item.receita_id = p_receita_id
          AND recipe_item.user_id = p_user_id
          AND item.user_id = p_user_id
        ORDER BY item.id
    LOOP
        UPDATE public.itens
        SET quantidade = v_insumo.saldo - v_insumo.necessario,
            status = 'ATIVO NO ESTOQUE'
        WHERE id = v_insumo.id AND user_id = p_user_id;

        INSERT INTO public.historico (
            item_id, user_id, tipo, quantidade, valor_total, custo_unitario, observacao
        ) VALUES (
            v_insumo.id, p_user_id, 'SAIDA', v_insumo.necessario,
            v_insumo.custo_medio * v_insumo.necessario, v_insumo.custo_medio,
            'Produção: ' || v_nome_receita || ' (' || p_quantidade || ' UN)'
        );
    END LOOP;
END;
$$;
