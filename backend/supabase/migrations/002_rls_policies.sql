-- ============================================================
-- Migration: 002_rls_policies
-- Purpose: Row Level Security policies per PRD Section 10
-- ============================================================

-- ============================================================
-- PROFILES (PRD 10.8)
-- - Users can read profiles of board members they share a board with
-- - Users can only update their own profile
-- - Insert handled by trigger (see below)
-- ============================================================

-- Users can read their own profile
create policy "profiles_select_own"
  on profiles for select
  using (user_id = auth.uid());

-- Users can read profiles of people who share a board with them
create policy "profiles_select_board_members"
  on profiles for select
  using (
    exists (
      select 1
      from board_memberships my_boards
      join board_memberships their_boards
        on my_boards.board_id = their_boards.board_id
      where my_boards.user_id = auth.uid()
        and their_boards.user_id = profiles.user_id
    )
  );

-- Users can only update their own profile
create policy "profiles_update_own"
  on profiles for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Profile insert is handled via trigger on auth.users signup
-- Direct insert not allowed through client
create policy "profiles_insert_own"
  on profiles for insert
  with check (user_id = auth.uid());


-- ============================================================
-- BOARDS (PRD 10.2)
-- - Members can read boards they belong to
-- - Insert/update handled by resolve_board function (SECURITY DEFINER)
-- ============================================================

-- Users can read boards they are members of
create policy "boards_select_members"
  on boards for select
  using (
    exists (
      select 1
      from board_memberships
      where board_memberships.board_id = boards.id
        and board_memberships.user_id = auth.uid()
    )
  );

-- Board creation is handled by resolve_board (SECURITY DEFINER)
-- No direct insert policy needed


-- ============================================================
-- BOARD MEMBERSHIPS (PRD 10.2, 10.9)
-- - Users can read memberships for boards they belong to
-- - Users can only create membership for themselves
-- - Membership creation primarily via resolve_board function
-- ============================================================

-- Users can read memberships for boards they belong to
create policy "board_memberships_select"
  on board_memberships for select
  using (
    exists (
      select 1
      from board_memberships my_membership
      where my_membership.board_id = board_memberships.board_id
        and my_membership.user_id = auth.uid()
    )
  );

-- Users can only insert their own membership (backup for resolve_board)
-- Primary membership creation is via resolve_board (SECURITY DEFINER)
create policy "board_memberships_insert_self"
  on board_memberships for insert
  with check (user_id = auth.uid());


-- ============================================================
-- PROFILE AUTO-CREATION TRIGGER (PRD 4.8, 9.2)
-- Creates a profile when a new user signs up
-- first_name and last_name captured during signup flow
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

-- Trigger on auth.users insert
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ============================================================
-- HELPER FUNCTION: Check board membership
-- Reusable for feature table policies
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
