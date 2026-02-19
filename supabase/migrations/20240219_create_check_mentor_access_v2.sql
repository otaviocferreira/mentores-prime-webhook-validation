-- Função para verificar acesso de um customer a um mentor_slug específico
-- Usa o novo modelo: customer_products + product_mentor_map

CREATE OR REPLACE FUNCTION public.check_mentor_access_v2(
  p_customer_id uuid,
  p_mentor_slug text
)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT jsonb_build_object(
    'allowed', true,
    'expires_at', max(cp.expires_at),
    'plan', max(hp.name)
  )
  FROM public.customer_products cp
  JOIN public.product_mentor_map pm ON pm.hotmart_product_id = cp.hotmart_product_id
  JOIN public.hotmart_products hp ON hp.hotmart_product_id = cp.hotmart_product_id
  WHERE cp.customer_id = p_customer_id
    AND pm.mentor_slug = p_mentor_slug
    AND cp.status = 'ACTIVE'
    AND (cp.expires_at IS NULL OR cp.expires_at > now())
  HAVING count(*) > 0
  
  UNION ALL
  
  -- Se não encontrou nada, retorna false
  SELECT jsonb_build_object(
    'allowed', false,
    'expires_at', null,
    'plan', null
  )
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.customer_products cp2
    JOIN public.product_mentor_map pm2 ON pm2.hotmart_product_id = cp2.hotmart_product_id
    WHERE cp2.customer_id = p_customer_id
      AND pm2.mentor_slug = p_mentor_slug
      AND cp2.status = 'ACTIVE'
      AND (cp2.expires_at IS NULL OR cp2.expires_at > now())
  )
  LIMIT 1;
$$;

-- Adicionar comentário explicativo
COMMENT ON FUNCTION public.check_mentor_access_v2 IS 
  'Verifica se um customer tem acesso a um mentor_slug específico.
   Retorna jsonb com allowed, expires_at e plan name.
   Baseado em customer_products ativos e product_mentor_map.';