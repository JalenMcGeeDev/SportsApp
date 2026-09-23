-- Organizations, membership/roles, and the org-scoped workspace blob.
-- The workspace JSON shape matches packages/types' workspaceSchema exactly, so
-- packages/core's applyCommand() needs no changes: only where it's stored changes.

create extension if not exists pgcrypto;

create type public.org_role as enum ('org_owner', 'org_admin', 'org_staff');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  created_at timestamptz not null default now()
);

create table public.organization_members (
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.org_role not null default 'org_owner',
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

create index organization_members_user_id_idx on public.organization_members (user_id);

create table public.workspaces (
  org_id uuid primary key references public.organizations (id) on delete cascade,
  data jsonb not null,
  revision integer not null default 0,
  updated_at timestamptz not null default now()
);

-- SECURITY DEFINER helper avoids infinite-recursive RLS when organization_members
-- policies need to check organization_members itself.
create function public.is_org_member(target_org_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.organization_members
    where org_id = target_org_id and user_id = auth.uid()
  );
$$;

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.workspaces enable row level security;

create policy "members can view their organization" on public.organizations
  for select using (public.is_org_member(id));

create policy "members can view their org roster" on public.organization_members
  for select using (public.is_org_member(org_id));

create policy "members can view their workspace" on public.workspaces
  for select using (public.is_org_member(org_id));

create policy "members can update their workspace" on public.workspaces
  for update using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));

-- On signup, provision a fresh organization + owner membership + empty workspace.
-- organization_name can be passed via supabase.auth.signUp({ options: { data: { organization_name } } }).
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_org_id uuid;
  org_name text := coalesce(new.raw_user_meta_data ->> 'organization_name', 'My Organization');
  org_slug text := lower(regexp_replace(org_name, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || substr(new.id::text, 1, 8);
begin
  insert into public.organizations (name, slug) values (org_name, org_slug) returning id into new_org_id;
  insert into public.organization_members (org_id, user_id, role) values (new_org_id, new.id, 'org_owner');
  insert into public.workspaces (org_id, data, revision) values (
    new_org_id,
    jsonb_build_object(
      'revision', 0,
      'mode', 'live',
      'organization', jsonb_build_object(
        'name', org_name,
        'slug', org_slug,
        'ownerName', coalesce(new.raw_user_meta_data ->> 'owner_name', ''),
        'timezone', coalesce(new.raw_user_meta_data ->> 'timezone', 'UTC')
      ),
      'tournaments', '[]'::jsonb,
      'announcements', '[]'::jsonb,
      'notifications', '[]'::jsonb,
      'messages', '[]'::jsonb,
      'runs', '[]'::jsonb,
      'inviteJobs', '[]'::jsonb,
      'audit', '[]'::jsonb
    ),
    0
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
