create table if not exists public.public_mutation_limits (
  scope text not null,
  key_type text not null check (key_type in ('device','ip')),
  key_hash text not null,
  bucket_start timestamptz not null,
  request_count integer not null default 0,
  primary key(scope,key_type,key_hash,bucket_start)
);
alter table public.public_mutation_limits enable row level security;
revoke all on public.public_mutation_limits from public,anon,authenticated;
grant select,insert,update,delete on public.public_mutation_limits to service_role;

create or replace function public.consume_public_mutation_limit(
  p_scope text,p_device_key text,p_ip_key text,p_device_limit integer,p_ip_limit integer,p_window_seconds integer
) returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
declare
  bucket timestamptz := to_timestamp(floor(extract(epoch from clock_timestamp()) / p_window_seconds) * p_window_seconds);
  device_count integer;
  ip_count integer;
begin
  if p_scope='' or p_window_seconds<60 or p_device_limit<1 or p_ip_limit<p_device_limit then return false;end if;
  insert into public.public_mutation_limits(scope,key_type,key_hash,bucket_start,request_count)
    values(p_scope,'device',p_device_key,bucket,1)
    on conflict(scope,key_type,key_hash,bucket_start) do update set request_count=public.public_mutation_limits.request_count+1
    returning request_count into device_count;
  insert into public.public_mutation_limits(scope,key_type,key_hash,bucket_start,request_count)
    values(p_scope,'ip',p_ip_key,bucket,1)
    on conflict(scope,key_type,key_hash,bucket_start) do update set request_count=public.public_mutation_limits.request_count+1
    returning request_count into ip_count;
  if random()<0.02 then delete from public.public_mutation_limits where bucket_start<clock_timestamp()-interval '1 day';end if;
  return device_count<=p_device_limit and ip_count<=p_ip_limit;
end $$;
revoke all on function public.consume_public_mutation_limit(text,text,text,integer,integer,integer) from public,anon,authenticated;
grant execute on function public.consume_public_mutation_limit(text,text,text,integer,integer,integer) to service_role;
notify pgrst,'reload schema';
