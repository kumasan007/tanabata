-- 一次会社に対して職種・役割を割り当てる列を追加する。
-- 例: 多能工、配管工、電工 などを text[] として保存する。

alter table public.company_master
  add column if not exists primary_trade_roles text[] not null default '{}'::text[];

update public.company_master
set primary_trade_roles = '{}'::text[]
where primary_trade_roles is null;

notify pgrst, 'reload schema';
