-- ============================================================
-- Migration: 001_initial_schema
-- Purpose: Core collaboration foundation for construct-cycletwo
-- ============================================================

-- ------------------------------------------------------------
-- Profiles
-- Application-facing user identity.
-- auth.users remains authoritative for authentication.
-- ------------------------------------------------------------

create table profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);


-- ------------------------------------------------------------
-- Boards
-- Maps an Excalidraw collaboration room to our internal board ID.
--
-- SECURITY:
-- excalidraw_room_id stores ONLY the Excalidraw roomId.
-- The Excalidraw roomKey is encryption material and must never
-- be stored in Supabase.
-- ------------------------------------------------------------

create table boards (
  id uuid primary key default gen_random_uuid(),
  excalidraw_room_id text not null unique
   check (excalidraw_room_id ~ '^[A-Za-z0-9_-]+$'),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);


-- ------------------------------------------------------------
-- Board memberships
-- Establishes which authenticated users belong to each board.
-- Reopening the same board is idempotent because the
-- board_id/user_id pair is unique.
-- ------------------------------------------------------------

create table board_memberships (
  board_id uuid not null references boards(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),

  primary key (board_id, user_id)
);


-- ------------------------------------------------------------
-- Row Level Security
-- Policies are intentionally defined separately after the
-- schema foundation is complete and reviewed.
-- ------------------------------------------------------------

alter table profiles enable row level security;
alter table boards enable row level security;
alter table board_memberships enable row level security;

-- ------------------------------------------------------------
-- Resolve board context
--
-- Maps an Excalidraw roomId to our internal board UUID and
-- establishes membership for the currently authenticated user.
--
-- The function accepts ONLY roomId. The Excalidraw roomKey
-- must never be passed to or stored by Supabase.
-- ------------------------------------------------------------

create or replace function public.resolve_board(p_excalidraw_room_id text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_board_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

if p_excalidraw_room_id is null
   or p_excalidraw_room_id !~ '^[A-Za-z0-9_-]+$' then
  raise exception 'Invalid Excalidraw room ID';
end if;

  insert into public.boards (
    excalidraw_room_id,
    created_by
  )
  values (
    p_excalidraw_room_id,
    v_user_id
  )
  on conflict (excalidraw_room_id)
  do nothing;

  select id
    into v_board_id
    from public.boards
   where excalidraw_room_id = p_excalidraw_room_id;

  if v_board_id is null then
    raise exception 'Unable to resolve board';
  end if;

  insert into public.board_memberships (
    board_id,
    user_id
  )
  values (
    v_board_id,
    v_user_id
  )
  on conflict (board_id, user_id)
  do nothing;

  return v_board_id;
end;
$$;

revoke all on function public.resolve_board(text) from public;
grant execute on function public.resolve_board(text) to authenticated;