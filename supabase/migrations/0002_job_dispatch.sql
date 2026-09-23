-- pg_cron ticks on an interval and
-- dispatches an HTTP call (via pg_net) to the "process-jobs" Edge Function for
-- every org that has a queued schedule run or invite job in its workspace JSONB.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault;

-- Required one-time setup (run in the Supabase SQL editor, NOT via a committed
-- migration, since it's a live secret):
--   select vault.create_secret('<paste your service_role key>', 'service_role_key', 'Used by pg_cron to call Edge Functions');
-- To rotate later: select vault.update_secret(id, '<new value>') from vault.secrets where name = 'service_role_key';

create or replace function public.dispatch_queued_jobs()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  service_key text;
  org record;
begin
  select decrypted_secret into service_key from vault.decrypted_secrets where name = 'service_role_key' limit 1;
  if service_key is null then
    raise notice 'season: service_role_key vault secret is not set yet; skipping job dispatch.';
    return;
  end if;

  for org in
    select w.org_id
    from public.workspaces w
    where exists (select 1 from jsonb_array_elements(w.data -> 'runs') r where r ->> 'status' = 'queued')
       or exists (select 1 from jsonb_array_elements(w.data -> 'inviteJobs') j where j ->> 'status' = 'queued')
  loop
    perform net.http_post(
      url := 'https://nogbhefbcibkajmdldoy.supabase.co/functions/v1/process-jobs',
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || service_key),
      body := jsonb_build_object('orgId', org.org_id)
    );
  end loop;
end;
$$;

-- pg_cron on Supabase supports sub-minute intervals like '10 seconds'; fall back
-- to a standard 5-column cron expression (e.g. '* * * * *') if yours doesn't.
select cron.schedule('season-dispatch-jobs', '10 seconds', $$select public.dispatch_queued_jobs()$$);
