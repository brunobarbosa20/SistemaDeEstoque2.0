-- 10. Adiciona identificação às vendas e atualiza a função RPC.
-- Execute após 09_registro_venda.sql; os registros de venda existentes são preservados.

ALTER TABLE public.vendas
    ADD COLUMN IF NOT EXISTS titulo TEXT NOT NULL DEFAULT 'Venda sem identificação';

DROP FUNCTION IF EXISTS public.registrar_venda(UUID, JSONB);

CREATE OR REPLACE FUNCTION public.registrar_venda(
    p_user_id UUID,
    p_titulo TEXT,
    p_itens JSONB
) RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_venda_id UUID := gen_random_uuid();
    v_venda_item_id UUID;
    v_requirements JSONB;
    v_line RECORD;
    v_extra RECORD;
    v_stock RECORD;
    v_product_name TEXT;
    v_product_cost NUMERIC(14,4);
    v_additional_cost NUMERIC(14,4);
    v_extra_quantity NUMERIC(16,3);
    v_extra_cost NUMERIC(14,4);
    v_line_cost NUMERIC(14,4);
    v_line_revenue NUMERIC(14,4);
    v_total_cost NUMERIC(14,4) := 0;
    v_total_revenue NUMERIC(14,4) := 0;
    v_total_quantity BIGINT := 0;
    v_invalid_item UUID;
    v_sale_title TEXT;
BEGIN
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'Usuário da venda não informado.';
    END IF;
    IF jsonb_typeof(p_itens) IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'A lista de produtos da venda deve ser válida.';
    END IF;
    IF jsonb_array_length(p_itens) = 0 THEN
        RAISE EXCEPTION 'A venda precisa ter ao menos um produto.';
    END IF;

    v_sale_title := regexp_replace(trim(COALESCE(p_titulo, '')), '[[:space:]]+', ' ', 'g');
    IF v_sale_title = '' OR length(v_sale_title) > 120 THEN
        RAISE EXCEPTION 'Informe um título para a venda com no máximo 120 caracteres.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM jsonb_to_recordset(p_itens) AS line(item_id UUID, quantidade NUMERIC, valor_unitario NUMERIC, adicionais JSONB)
        WHERE line.item_id IS NULL
           OR line.quantidade IS NULL
           OR line.quantidade <= 0
           OR line.quantidade <> trunc(line.quantidade)
           OR line.quantidade > 2147483647
           OR line.valor_unitario IS NULL
           OR line.valor_unitario <= 0
    ) THEN
        RAISE EXCEPTION 'Produtos, quantidades inteiras e preços de venda devem ser válidos.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements(p_itens) AS raw(line_json)
        CROSS JOIN LATERAL jsonb_to_record(raw.line_json) AS line(adicionais JSONB)
        WHERE line.adicionais IS NOT NULL
          AND jsonb_typeof(line.adicionais) IS DISTINCT FROM 'array'
    ) THEN
        RAISE EXCEPTION 'Os adicionais da venda devem ser informados em uma lista.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements(p_itens) AS raw(line_json)
        CROSS JOIN LATERAL jsonb_to_record(raw.line_json) AS line(quantidade NUMERIC, adicionais JSONB)
        CROSS JOIN LATERAL jsonb_to_recordset(COALESCE(line.adicionais, '[]'::JSONB))
            AS extra(item_id UUID, quantidade_por_unidade NUMERIC)
        WHERE extra.item_id IS NULL
           OR extra.quantidade_por_unidade IS NULL
           OR extra.quantidade_por_unidade <= 0
           OR extra.quantidade_por_unidade <> trunc(extra.quantidade_por_unidade, 3)
    ) THEN
        RAISE EXCEPTION 'Cada adicional precisa ter um item e uma quantidade por unidade maiores que zero.';
    END IF;

    WITH usage_rows AS (
        SELECT line.item_id, line.quantidade AS quantidade
        FROM jsonb_to_recordset(p_itens) AS line(item_id UUID, quantidade NUMERIC)
        UNION ALL
        SELECT extra.item_id, line.quantidade * extra.quantidade_por_unidade
        FROM jsonb_array_elements(p_itens) AS raw(line_json)
        CROSS JOIN LATERAL jsonb_to_record(raw.line_json) AS line(quantidade NUMERIC, adicionais JSONB)
        CROSS JOIN LATERAL jsonb_to_recordset(COALESCE(line.adicionais, '[]'::JSONB))
            AS extra(item_id UUID, quantidade_por_unidade NUMERIC)
    ),
    requirements AS (
        SELECT item_id, SUM(quantidade) AS quantidade
        FROM usage_rows
        GROUP BY item_id
    )
    SELECT COALESCE(
        jsonb_agg(jsonb_build_object('item_id', item_id, 'quantidade', quantidade)),
        '[]'::JSONB
    )
    INTO v_requirements
    FROM requirements;

    PERFORM item.id
    FROM public.itens AS item
    JOIN jsonb_to_recordset(v_requirements) AS required(item_id UUID, quantidade NUMERIC)
        ON required.item_id = item.id
    WHERE item.user_id = p_user_id
    ORDER BY item.id
    FOR UPDATE OF item;

    SELECT line.item_id INTO v_invalid_item
    FROM jsonb_to_recordset(p_itens) AS line(item_id UUID)
    LEFT JOIN public.itens AS item
        ON item.id = line.item_id
       AND item.user_id = p_user_id
       AND item.categoria = 'PRODUTO_PRONTO'
    WHERE item.id IS NULL
       OR item.status = 'CADASTRO PENDENTE'
    LIMIT 1;
    IF FOUND THEN
        RAISE EXCEPTION 'Um produto selecionado não pertence ao usuário ou não está na categoria Produto Pronto.';
    END IF;

    SELECT extra.item_id INTO v_invalid_item
    FROM jsonb_array_elements(p_itens) AS raw(line_json)
    CROSS JOIN LATERAL jsonb_to_record(raw.line_json) AS line(adicionais JSONB)
    CROSS JOIN LATERAL jsonb_to_recordset(COALESCE(line.adicionais, '[]'::JSONB))
        AS extra(item_id UUID)
    LEFT JOIN public.itens AS item
        ON item.id = extra.item_id
       AND item.user_id = p_user_id
       AND item.categoria IN ('INGREDIENTE', 'EMBALAGEM')
    WHERE item.id IS NULL
       OR item.status = 'CADASTRO PENDENTE'
    LIMIT 1;
    IF FOUND THEN
        RAISE EXCEPTION 'Um adicional não pertence ao usuário ou não é ingrediente/embalagem.';
    END IF;

    FOR v_stock IN
        SELECT item.titulo, item.unidade, item.quantidade AS saldo,
               required.quantidade AS necessario
        FROM jsonb_to_recordset(v_requirements) AS required(item_id UUID, quantidade NUMERIC)
        JOIN public.itens AS item
            ON item.id = required.item_id
           AND item.user_id = p_user_id
        ORDER BY item.id
    LOOP
        IF v_stock.saldo < v_stock.necessario THEN
            RAISE EXCEPTION 'Estoque insuficiente para %: disponível % %, necessário % %.',
                v_stock.titulo, v_stock.saldo, v_stock.unidade,
                v_stock.necessario, v_stock.unidade;
        END IF;
    END LOOP;

    INSERT INTO public.vendas (id, user_id, titulo)
    VALUES (v_venda_id, p_user_id, v_sale_title);

    FOR v_line IN
        SELECT *
        FROM jsonb_to_recordset(p_itens)
            AS line(item_id UUID, quantidade NUMERIC, valor_unitario NUMERIC, adicionais JSONB)
    LOOP
        SELECT item.titulo, item.custo_medio
        INTO v_product_name, v_product_cost
        FROM public.itens AS item
        WHERE item.id = v_line.item_id AND item.user_id = p_user_id;

        v_additional_cost := 0;
        FOR v_extra IN
            SELECT extra.item_id, extra.quantidade_por_unidade,
                   item.titulo, item.custo_medio
            FROM jsonb_to_recordset(COALESCE(v_line.adicionais, '[]'::JSONB))
                AS extra(item_id UUID, quantidade_por_unidade NUMERIC)
            JOIN public.itens AS item
                ON item.id = extra.item_id AND item.user_id = p_user_id
            ORDER BY item.id
        LOOP
            v_extra_quantity := v_line.quantidade * v_extra.quantidade_por_unidade;
            v_extra_cost := v_extra_quantity * v_extra.custo_medio;
            v_additional_cost := v_additional_cost + v_extra_cost;
        END LOOP;

        v_line_cost := (v_line.quantidade * v_product_cost) + v_additional_cost;
        v_line_revenue := v_line.quantidade * v_line.valor_unitario;
        INSERT INTO public.venda_itens (
            venda_id, user_id, item_id, item_nome, quantidade, valor_unitario,
            custo_unitario, custo_adicionais, valor_total, custo_total
        ) VALUES (
            v_venda_id, p_user_id, v_line.item_id, v_product_name, v_line.quantidade,
            v_line.valor_unitario, v_product_cost, v_additional_cost, v_line_revenue, v_line_cost
        ) RETURNING id INTO v_venda_item_id;

        FOR v_extra IN
            SELECT extra.item_id, extra.quantidade_por_unidade,
                   item.titulo, item.custo_medio
            FROM jsonb_to_recordset(COALESCE(v_line.adicionais, '[]'::JSONB))
                AS extra(item_id UUID, quantidade_por_unidade NUMERIC)
            JOIN public.itens AS item
                ON item.id = extra.item_id AND item.user_id = p_user_id
            ORDER BY item.id
        LOOP
            v_extra_quantity := v_line.quantidade * v_extra.quantidade_por_unidade;
            v_extra_cost := v_extra_quantity * v_extra.custo_medio;
            INSERT INTO public.venda_adicionais (
                venda_item_id, user_id, item_id, item_nome, quantidade_por_unidade,
                quantidade_total, custo_unitario, custo_total
            ) VALUES (
                v_venda_item_id, p_user_id, v_extra.item_id, v_extra.titulo,
                v_extra.quantidade_por_unidade, v_extra_quantity, v_extra.custo_medio, v_extra_cost
            );
        END LOOP;

        v_total_cost := v_total_cost + v_line_cost;
        v_total_revenue := v_total_revenue + v_line_revenue;
        v_total_quantity := v_total_quantity + v_line.quantidade::BIGINT;
    END LOOP;

    INSERT INTO public.historico (
        item_id, user_id, tipo, quantidade, valor_total, custo_unitario, observacao
    )
    SELECT item.id, p_user_id, 'SAIDA', required.quantidade,
           required.quantidade * item.custo_medio, item.custo_medio,
           'Venda ' || v_sale_title || ' (' || left(v_venda_id::TEXT, 8) || ')'
    FROM jsonb_to_recordset(v_requirements) AS required(item_id UUID, quantidade NUMERIC)
    JOIN public.itens AS item
        ON item.id = required.item_id AND item.user_id = p_user_id;

    UPDATE public.itens AS item
    SET quantidade = item.quantidade - required.quantidade,
        status = 'ATIVO NO ESTOQUE'
    FROM jsonb_to_recordset(v_requirements) AS required(item_id UUID, quantidade NUMERIC)
    WHERE item.id = required.item_id
      AND item.user_id = p_user_id;

    UPDATE public.vendas
    SET quantidade_itens = v_total_quantity,
        valor_custo = v_total_cost,
        valor_venda = v_total_revenue,
        lucro = v_total_revenue - v_total_cost,
        margem_percentual = ((v_total_revenue - v_total_cost) / v_total_revenue) * 100
    WHERE id = v_venda_id AND user_id = p_user_id;

    RETURN v_venda_id;
END;
$$;
