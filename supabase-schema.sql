-- Execute este arquivo uma única vez em Supabase > SQL Editor.
-- Cria os perfis (um por conta) e os links de cada perfil.
-- Leitura é pública (a página do perfil é aberta por qualquer visitante);
-- escrita só é permitida ao dono da conta.

create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique,
  display_name text not null default '',
  bio text not null default '',
  avatar_url text not null default '',
  theme text not null default 'claro',
  created_at timestamptz not null default now(),
  constraint profiles_username_format check (username ~ '^[a-z0-9_]{3,30}$'),
  constraint profiles_display_name_len check (char_length(display_name) <= 60),
  constraint profiles_bio_len check (char_length(bio) <= 160),
  constraint profiles_avatar_url_format check (avatar_url = '' or (avatar_url ~* '^https://' and char_length(avatar_url) <= 2000)),
  constraint profiles_theme_valid check (theme in ('claro', 'escuro', 'oceano', 'por-do-sol'))
);

create table if not exists public.links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  url text not null,
  position integer not null default 0,
  is_active boolean not null default true,
  clicks integer not null default 0,
  created_at timestamptz not null default now(),
  constraint links_title_len check (char_length(title) between 1 and 80),
  -- Só http/https: impede links "javascript:" e semelhantes.
  constraint links_url_format check (url ~* '^https?://' and char_length(url) <= 2000)
);

create index if not exists links_user_position_idx on public.links (user_id, position);

alter table public.profiles enable row level security;
alter table public.links enable row level security;

-- Perfis: qualquer pessoa lê; só o dono cria, altera e apaga.
create policy "Perfis são públicos para leitura"
  on public.profiles for select
  to anon, authenticated
  using (true);

create policy "Usuários criam apenas o próprio perfil"
  on public.profiles for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Usuários alteram apenas o próprio perfil"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Usuários removem apenas o próprio perfil"
  on public.profiles for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- Links: visitantes só enxergam os ativos; o dono enxerga todos os seus.
create policy "Links ativos são públicos para leitura"
  on public.links for select
  to anon, authenticated
  using (is_active or (select auth.uid()) = user_id);

create policy "Usuários criam apenas os próprios links"
  on public.links for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Usuários alteram apenas os próprios links"
  on public.links for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Usuários removem apenas os próprios links"
  on public.links for delete
  to authenticated
  using ((select auth.uid()) = user_id);

grant select on public.profiles to anon;
grant select, insert, update, delete on public.profiles to authenticated;
grant select on public.links to anon;
grant select, insert, update, delete on public.links to authenticated;

-- Contador de cliques: visitantes não têm permissão de UPDATE na tabela,
-- então o incremento passa por esta função (só mexe em links ativos).
create or replace function public.register_click(link_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.links set clicks = clicks + 1 where id = link_id and is_active;
$$;

revoke all on function public.register_click(uuid) from public;
grant execute on function public.register_click(uuid) to anon, authenticated;
