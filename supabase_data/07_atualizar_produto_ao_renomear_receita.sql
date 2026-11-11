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
    v_nome_anterior TEXT;
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
        SELECT nome INTO v_nome_anterior
        FROM public.receitas
        WHERE id = p_receita_id AND user_id = p_user_id
        FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Receita não encontrada para este usuário.';
        END IF;

        UPDATE public.receitas
        SET nome = trim(p_nome), rendimento = p_rendimento
        WHERE id = p_receita_id AND user_id = p_user_id
        RETURNING id INTO v_receita_id;

        IF regexp_replace(lower(trim(v_nome_anterior)), '[[:space:]]+', ' ', 'g')
           <> regexp_replace(lower(trim(p_nome)), '[[:space:]]+', ' ', 'g') THEN
            UPDATE public.itens
            SET titulo = trim(p_nome)
            WHERE user_id = p_user_id
              AND regexp_replace(lower(trim(titulo)), '[[:space:]]+', ' ', 'g')
                  = regexp_replace(lower(trim(v_nome_anterior)), '[[:space:]]+', ' ', 'g');
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
