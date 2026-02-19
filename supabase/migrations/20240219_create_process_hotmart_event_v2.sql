-- Função transacional para processar eventos da Hotmart - Nova versão V2
-- Esta função substitui a process_hotmart_event antiga para o novo modelo de dados

CREATE OR REPLACE FUNCTION public.process_hotmart_event_v2(
  p_idempotency_key text,
  p_event_type text,
  p_hotmart_reference text,
  p_buyer_email text,
  p_hotmart_product_id bigint,
  p_ucode text,
  p_status text,
  p_expires_at timestamptz,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_customer_id uuid;
  v_customer_product_id uuid;
  v_existing_event boolean;
  v_result jsonb;
BEGIN
  -- Verificar idempotência
  SELECT EXISTS(
    SELECT 1 FROM public.hotmart_event_ledger_min 
    WHERE idempotency_key = p_idempotency_key
  ) INTO v_existing_event;
  
  IF v_existing_event THEN
    RETURN jsonb_build_object(
      'status', 'ignored',
      'reason', 'duplicate_event',
      'idempotency_key', p_idempotency_key
    );
  END IF;

  -- Iniciar transação implícita
  -- Passo 1: Upsert do customer
  INSERT INTO public.customers (email)
  VALUES (lower(p_buyer_email))
  ON CONFLICT (email) DO UPDATE 
  SET email = excluded.email
  RETURNING id INTO v_customer_id;

  -- Passo 2: Garantir que o produto existe em hotmart_products
  INSERT INTO public.hotmart_products (
    hotmart_product_id, 
    ucode, 
    name, 
    status, 
    is_subscription, 
    active,
    created_at,
    updated_at
  )
  VALUES (
    p_hotmart_product_id,
    p_ucode,
    COALESCE(p_payload->'data'->'product'->>'name', 'Produto Hotmart ' || p_hotmart_product_id::text),
    'ACTIVE',
    false, -- por padrão não é subscription, pode ser atualizado depois
    true,
    now(),
    now()
  )
  ON CONFLICT (hotmart_product_id) DO UPDATE
  SET 
    ucode = COALESCE(p_ucode, hotmart_products.ucode),
    updated_at = now()
  WHERE p_ucode IS NOT NULL;

  -- Passo 3: Upsert em customer_products
  INSERT INTO public.customer_products (
    customer_id,
    hotmart_product_id,
    hotmart_reference,
    status,
    expires_at,
    created_at,
    updated_at
  )
  VALUES (
    v_customer_id,
    p_hotmart_product_id,
    p_hotmart_reference,
    p_status,
    CASE 
      WHEN p_status = 'ACTIVE' THEN p_expires_at
      ELSE now() -- para status não ativos, expira imediatamente
    END,
    now(),
    now()
  )
  ON CONFLICT (customer_id, hotmart_product_id) DO UPDATE
  SET 
    hotmart_reference = p_hotmart_reference,
    status = p_status,
    expires_at = CASE 
      WHEN p_status = 'ACTIVE' THEN p_expires_at
      ELSE now() -- mantém ou atualiza para expirado
    END,
    updated_at = now();

  -- Obter o ID do customer_product atualizado/inserido
  SELECT id INTO v_customer_product_id
  FROM public.customer_products
  WHERE customer_id = v_customer_id 
    AND hotmart_product_id = p_hotmart_product_id;

  -- Passo 4: Registrar o evento no ledger
  INSERT INTO public.hotmart_event_ledger_min (
    idempotency_key,
    event_type,
    hotmart_reference,
    buyer_email,
    hotmart_product_id,
    status,
    payload,
    received_at,
    processed_at
  )
  VALUES (
    p_idempotency_key,
    p_event_type,
    p_hotmart_reference,
    lower(p_buyer_email),
    p_hotmart_product_id,
    p_status,
    p_payload,
    now(),
    now()
  );

  -- Retornar resultado
  v_result := jsonb_build_object(
    'status', 'processed',
    'customer_id', v_customer_id,
    'customer_product_id', v_customer_product_id,
    'hotmart_product_id', p_hotmart_product_id,
    'status', p_status,
    'expires_at', p_expires_at
  );

  RETURN v_result;

EXCEPTION
  WHEN OTHERS THEN
    -- Registrar erro no ledger se possível
    INSERT INTO public.hotmart_event_ledger_min (
      idempotency_key,
      event_type,
      hotmart_reference,
      buyer_email,
      hotmart_product_id,
      status,
      payload,
      received_at,
      processed_at
    )
    VALUES (
      p_idempotency_key,
      p_event_type,
      p_hotmart_reference,
      lower(p_buyer_email),
      p_hotmart_product_id,
      'FAILED',
      jsonb_build_object('error', SQLERRM, 'payload', p_payload),
      now(),
      now()
    );
    
    RAISE EXCEPTION 'Error processing Hotmart event: %', SQLERRM;
END;
$$;

-- Adicionar comentário explicativo
COMMENT ON FUNCTION public.process_hotmart_event_v2 IS 
  'Processa eventos de webhook da Hotmart de forma transacional. 
   Versão 2: novo modelo com customer_products e product_mentor_map.
   Idempotente via idempotency_key.';