-- 1) Enum de status 
do $$ begin 
  create type public.access_status as enum ( 
    'ACTIVE', 
    'CANCELED', 
    'REFUNDED', 
    'CHARGEBACK', 
    'EXPIRED' 
  ); 
exception 
  when duplicate_object then null; 
end $$; 

-- 2) Customers (separado do auth.users no MVP) 
create table if not exists public.customers ( 
  id uuid primary key default gen_random_uuid(), 
  email text not null unique, 
  created_at timestamptz not null default now() 
); 

-- 3) Subscriptions (MVP: 1 linha por assinatura/relação principal) 
create table if not exists public.subscriptions ( 
  id uuid primary key default gen_random_uuid(), 
  customer_id uuid not null references public.customers(id) on delete cascade, 
  hotmart_reference text, -- ex.: subscription_id ou purchase_id (o que você tiver) 
  product_id text, 
  offer_id text, 
  plan_code text,         -- ex.: "prime", "java-track" etc (MVP pode ser null) 
  status public.access_status not null, 
  current_period_end timestamptz, 
  canceled_at timestamptz, 
  updated_at timestamptz not null default now(), 
  created_at timestamptz not null default now() 
); 

create index if not exists idx_subscriptions_customer on public.subscriptions(customer_id); 
create index if not exists idx_subscriptions_reference on public.subscriptions(hotmart_reference); 

-- 4) Mentor access (chave por customer + mentor_slug) 
create table if not exists public.mentor_access ( 
  id uuid primary key default gen_random_uuid(), 
  customer_id uuid not null references public.customers(id) on delete cascade, 
  mentor_slug text not null,         -- "java", "python", "react"... 
  allowed boolean not null default false, 
  expires_at timestamptz, 
  source text not null default 'hotmart', 
  updated_at timestamptz not null default now(), 
  created_at timestamptz not null default now(), 
  unique (customer_id, mentor_slug) 
); 

create index if not exists idx_mentor_access_lookup 
  on public.mentor_access(mentor_slug, customer_id); 

-- 5) Ledger / Event log (idempotência aqui) 
create table if not exists public.hotmart_event_ledger ( 
  id uuid primary key default gen_random_uuid(), 
  idempotency_key text not null unique, 
  event_type text not null,               -- ex.: "PURCHASE_APPROVED", "SUBSCRIPTION_CANCELED"... 
  hotmart_reference text,                 -- purchase/subscription id (se tiver) 
  buyer_email text, 
  processing_status text not null default 'RECEIVED', -- RECEIVED | PROCESSED | FAILED 
  error text, 
  payload jsonb not null, 
  received_at timestamptz not null default now(), 
  processed_at timestamptz 
); 

create index if not exists idx_hotmart_ledger_email on public.hotmart_event_ledger(buyer_email); 
create index if not exists idx_hotmart_ledger_ref on public.hotmart_event_ledger(hotmart_reference); 

-- 6) Função transacional: grava ledger (idempotente) + atualiza acesso 
-- Observação: no MVP, a "regra de quais mentores liberar" vem do payload mapeado no backend. 
-- Você pode passar mentor_slugs e expires_at prontos. 
create or replace function public.process_hotmart_event( 
  p_idempotency_key text, 
  p_event_type text, 
  p_hotmart_reference text, 
  p_buyer_email text, 
  p_status public.access_status, 
  p_mentor_slugs text[], 
  p_expires_at timestamptz, 
  p_payload jsonb 
) 
returns jsonb 
language plpgsql 
as $$ 
declare 
  v_customer_id uuid; 
begin 
  -- 1) Idempotência: tenta inserir no ledger; se já existe, retorna "duplicate" 
  begin 
    insert into public.hotmart_event_ledger ( 
      idempotency_key, event_type, hotmart_reference, buyer_email, payload 
    ) values ( 
      p_idempotency_key, p_event_type, p_hotmart_reference, p_buyer_email, p_payload 
    ); 
  exception when unique_violation then 
    return jsonb_build_object( 
      'ok', true, 
      'duplicate', true, 
      'idempotency_key', p_idempotency_key 
    ); 
  end; 

  -- 2) Upsert customer 
  insert into public.customers(email) 
  values (lower(p_buyer_email)) 
  on conflict (email) do update set email = excluded.email 
  returning id into v_customer_id; 

  -- 3) Upsert subscription (MVP: 1 por hotmart_reference; se não tiver referência, você pode mandar null) 
  if p_hotmart_reference is not null then 
    insert into public.subscriptions(customer_id, hotmart_reference, status, current_period_end) 
    values (v_customer_id, p_hotmart_reference, p_status, p_expires_at) 
    on conflict (hotmart_reference) do update 
      set status = excluded.status, 
          current_period_end = excluded.current_period_end, 
          updated_at = now(); 
  end if; 

  -- 4) Atualiza mentor_access 
  -- Regra simples: 
  -- - ACTIVE => allowed=true, expires_at = p_expires_at 
  -- - CANCELED/REFUNDED/CHARGEBACK/EXPIRED => allowed=false (e mantém expires_at por histórico) 
  if p_mentor_slugs is not null then 
    insert into public.mentor_access(customer_id, mentor_slug, allowed, expires_at) 
    select v_customer_id, 
           unnest(p_mentor_slugs), 
           (p_status = 'ACTIVE'), 
           p_expires_at 
    on conflict (customer_id, mentor_slug) do update 
      set allowed = excluded.allowed, 
          expires_at = excluded.expires_at, 
          updated_at = now(); 
  end if; 

  -- 5) Finaliza ledger 
  update public.hotmart_event_ledger 
    set processing_status = 'PROCESSED', 
        processed_at = now() 
  where idempotency_key = p_idempotency_key; 

  return jsonb_build_object( 
    'ok', true, 
    'duplicate', false, 
    'customer_email', p_buyer_email, 
    'status', p_status::text 
  ); 
exception 
  when others then 
    update public.hotmart_event_ledger 
      set processing_status = 'FAILED', 
          error = sqlerrm, 
          processed_at = now() 
    where idempotency_key = p_idempotency_key; 

    return jsonb_build_object('ok', false, 'error', sqlerrm); 
end; 
$$;