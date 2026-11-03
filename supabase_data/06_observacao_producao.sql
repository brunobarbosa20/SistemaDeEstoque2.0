DROP FUNCTION IF EXISTS public.registrar_producao(UUID, UUID, INTEGER);

CREATE OR REPLACE FUNCTION public.registrar_producao(
    p_user_id UUID,
    p_receita_id UUID,
    p_quantidade INTEGER,
    p_observacao TEXT DEFAULT NULL
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
            'Produção: ' || v_nome_receita || ' (' || p_quantidade || ' UN)' ||
            CASE
                WHEN NULLIF(trim(p_observacao), '') IS NULL THEN ''
                ELSE ' · ' || trim(p_observacao)
            END
        );
    END LOOP;
END;
$$;
