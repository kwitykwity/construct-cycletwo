-- ============================================================
-- Migration: 002_rls_policies
-- Purpose: Row Level Security policies per PRD Section 10
--
-- REVISION NOTES (consolidated engineering review):
-- 1. Fixed recursive RLS on board_memberships using SECURITY DEFINER helper
-- 2. Removed profiles_insert_own (signup trigger is authoritative path)
-- 3. Removed board_memberships_insert_self (resolve_board is authoritative path)
--
-- REVISION 2 (second engineering review):
-- 4. Revoke PUBLIC execution on SECURITY DEFINER functions
-- 5. Grant authenticated execution only where needed for RLS
-- 6. Trigger functions not exposed as client RPC endpoints
-- ============================================================


-- ============================================================
-- HELPER FUNCTION: Check board membership (SECURITY DEFINER)
-- Must be defined BEFORE policies that depend on it
-- Avoids recursive RLS evaluation by bypassing RLS on board_memberships
-- ============================================================

create or replace function public.is_board_member(p_board_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.board_memberships
    where board_id = p_board_id
      and user_id = auth.uid()
  );
$$;

-- Revoke default PUBLIC execution, grant only to authenticated users
-- This helper is used in RLS policies which run in authenticated context
revoke execute on function public.is_board_member(uuid) from public;
grant execute on function public.is_board_member(uuid) to authenticated;


-- ============================================================
-- PROFILE AUTO-CREATION TRIGGER (PRD 4.8, 9.2)
-- Creates a profile when a new user signs up
-- This is the ONLY path for profile creation - no direct client insert
-- NOT callable by clients - trigger-only function
-- ============================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, first_name, last_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'first_name', ''),
    coalesce(new.raw_user_meta_data->>'last_name', '')
  );
  return new;
end;
$$;

-- Revoke all execution - this is a trigger function, not a client RPC
revoke execute on function public.handle_new_user() from public;
revoke execute on function public.handle_new_user() from authenticated;

-- Trigger on auth.users insert
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ============================================================
-- PROFILES (PRD 10.8)
-- - Users can read profiles of board members they share a board with
-- - Users can only update their own profile
-- - Insert ONLY via signup trigger (no client insert policy)
-- ============================================================

-- Users can read their own profile
create policy "profiles_select_own"
  on profiles for select
  using (user_id = auth.uid());

-- Users can read profiles of people who share a board with them
-- Uses SECURITY DEFINER helper to check membership without recursion
create policy "profiles_select_board_members"
  on profiles for select
  using (
    exists (
      select 1
      from public.board_memberships bm
      where bm.user_id = profiles.user_id
        and public.is_board_member(bm.board_id)
    )
  );

-- Users can only update their own profile
create policy "profiles_update_own"
  on profiles for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- NO profiles_insert_own policy
-- Profile creation is ONLY via handle_new_user() trigger


-- ============================================================
-- BOARDS (PRD 10.2)
-- - Members can read boards they belong to
-- - Insert/update handled by resolve_board function (SECURITY DEFINER)
-- ============================================================

-- Users can read boards they are members of
-- Uses SECURITY DEFINER helper to avoid recursive RLS
create policy "boards_select_members"
  on boards for select
  using (public.is_board_member(id));

-- Board creation is handled by resolve_board (SECURITY DEFINER)
-- No direct insert policy


-- ============================================================
-- BOARD MEMBERSHIPS (PRD 10.2, 10.9)
-- - Users can read memberships for boards they belong to
-- - Membership creation ONLY via resolve_board (SECURITY DEFINER)
-- - No direct client insert policy
-- ============================================================

-- Users can read memberships for boards they belong to
-- Uses SECURITY DEFINER helper to avoid recursive RLS evaluation
create policy "board_memberships_select"
  on board_memberships for select
  using (public.is_board_member(board_id));

-- NO board_memberships_insert_self policy
-- Membership creation is ONLY via resolve_board()
-- A direct INSERT policy with only user_id = auth.uid() would allow
-- users to add themselves to any board if they know the board_id
