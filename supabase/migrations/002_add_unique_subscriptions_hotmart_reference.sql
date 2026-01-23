-- Adiciona constraint única para suportar ON CONFLICT(hotmart_reference)
alter table public.subscriptions
  add constraint subscriptions_hotmart_reference_unique unique (hotmart_reference);