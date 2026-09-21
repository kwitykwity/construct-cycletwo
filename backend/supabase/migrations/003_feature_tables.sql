-- ============================================================
-- Migration: 003_feature_tables
-- Purpose: Element Authorship, History, Personal Notes, Team Notes
-- PRD Sections: 9.5-9.9, 10.3-10.7
--
-- REVISION NOTES (consolidated engineering review):
-- 4. Personal Notes UPDATE/DELETE now require board membership
-- 5. Team Notes author operations preserve board-membership boundary
-- 6. Selected Team Note viewers must be current board members
-- 7. Team Notes/Viewers RLS recursion eliminated via SECURITY DEFINER helpers
-- 8. First publication is atomic via publish_team_note() RPC
-- 9. Visibility changes are atomic via update_team_note_visibility() RPC
-- 10. Database invariants enforce valid publication state
--
-- REVISION 2 (second engineering review):
-- 11. team_notes_update cannot bypass atomic RPCs (publication fields protected)
-- 12. team_note_viewers INSERT/DELETE restricted for published notes
-- 13. publish_team_note() now persists content atomically with publication
-- 14. EXECUTE privileges: revoke PUBLIC, grant authenticated only where needed
--
-- REVISION 3 (second engineering review continued):
-- 15. Added update_published_team_note_content() for author edits after publication
--
-- REVISION 4 (PRD alignment):
-- 16. Draft policy allows setting visibility_type before publication
-- 17. publish_team_note() clears draft viewers before inserting publication viewers
-- 18. team_note_viewers_select_self requires published note (draft config author-only)
-- ============================================================


-- ============================================================
-- ELEMENT AUTHORSHIP (PRD 9.5)
-- Tracks original creator of Excalidraw elements
-- Creator and creation time are permanent, never transferred
-- ============================================================

create table element_authorship (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references boards(id) on delete cascade,
  element_id text not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),

  unique (board_id, element_id)
);

alter table element_authorship enable row level security;

-- PRD 10.4: Board members may retrieve authorship only for boards they belong to
create policy "element_authorship_select"
  on element_authorship for select
  using (public.is_board_member(board_id));

-- PRD 10.4: Insert requires membership and created_by = auth.uid()
create policy "element_authorship_insert"
  on element_authorship for insert
  with check (
    public.is_board_member(board_id)
    and created_by = auth.uid()
  );

-- No update policy: authorship is permanent (PRD 5.1)
-- No delete policy: authorship deletion is not a normal user action (PRD 10.4)


-- ============================================================
-- HISTORY EVENTS (PRD 9.6)
-- Append-only log of meaningful board changes
-- UI grouping/archive derived from timestamps
-- ============================================================

create table history_events (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references boards(id) on delete cascade,
  actor_id uuid not null references auth.users(id),
  action text not null check (action in (
    'Created', 'Edited', 'Moved', 'Resized', 'Deleted',
    'Duplicated', 'Grouped', 'Ungrouped', 'Locked', 'Unlocked',
    'Reordered', 'Reorganized'
  )),
  target_info jsonb,  -- element type, count, or other relevant info
  created_at timestamptz not null default now()
);

create index history_events_board_created_at
  on history_events (board_id, created_at desc);

alter table history_events enable row level security;

-- PRD 10.5: Board members retrieve History only for their boards
create policy "history_events_select"
  on history_events for select
  using (public.is_board_member(board_id));

-- PRD 10.5: Insert requires board membership and actor = auth.uid()
create policy "history_events_insert"
  on history_events for insert
  with check (
    public.is_board_member(board_id)
    and actor_id = auth.uid()
  );

-- No update/delete: Events are append-only (PRD 6.3, 10.5)


-- ============================================================
-- PERSONAL NOTES (PRD 9.7)
-- Private, board-scoped notes owned by authenticated user
-- Only the owner may CRUD
-- All operations require board membership (revision #4)
-- ============================================================

create table personal_notes (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references boards(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  content jsonb not null default '[]'::jsonb,  -- structured content with formatting
  created_at timestamptz not null default now(),
  content_edited_at timestamptz,  -- only updates on text changes, not formatting
  updated_at timestamptz not null default now()
);

create index personal_notes_board_owner
  on personal_notes (board_id, owner_id, created_at desc);

alter table personal_notes enable row level security;

-- PRD 10.3: Only owner can select their notes on boards they're members of
create policy "personal_notes_select"
  on personal_notes for select
  using (
    owner_id = auth.uid()
    and public.is_board_member(board_id)
  );

-- PRD 10.3: Only owner can insert notes for themselves
create policy "personal_notes_insert"
  on personal_notes for insert
  with check (
    owner_id = auth.uid()
    and public.is_board_member(board_id)
  );

-- PRD 10.3: Only owner can update their own notes (revision #4: add membership check)
create policy "personal_notes_update"
  on personal_notes for update
  using (
    owner_id = auth.uid()
    and public.is_board_member(board_id)
  )
  with check (
    owner_id = auth.uid()
    and public.is_board_member(board_id)
  );

-- PRD 10.3: Only owner can delete their own notes (revision #4: add membership check)
create policy "personal_notes_delete"
  on personal_notes for delete
  using (
    owner_id = auth.uid()
    and public.is_board_member(board_id)
  );


-- ============================================================
-- TEAM NOTES (PRD 9.8)
-- Collaborative notes with Everyone or Selected visibility
-- Original author is permanent owner
-- ============================================================

create type team_note_visibility as enum ('everyone', 'selected');

create table team_notes (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references boards(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  content jsonb not null default '[]'::jsonb,
  visibility_type team_note_visibility,  -- null until first publication
  draft_created_at timestamptz not null default now(),
  published_at timestamptz,  -- null = draft, non-null = published
  content_edited_at timestamptz,
  updated_at timestamptz not null default now(),

  -- Invariant #10: Published notes must have visibility set
  constraint team_notes_published_has_visibility
    check (published_at is null or visibility_type is not null)
);

create index team_notes_board_published
  on team_notes (board_id, published_at desc nulls last);

alter table team_notes enable row level security;


-- ============================================================
-- TEAM NOTE VIEWERS (PRD 9.9)
-- Selected visibility recipients
-- Only for visibility_type = 'selected'
-- ============================================================

create table team_note_viewers (
  team_note_id uuid not null references team_notes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),

  primary key (team_note_id, user_id)
);

alter table team_note_viewers enable row level security;


-- ============================================================
-- SECURITY DEFINER HELPERS FOR TEAM NOTES
-- Eliminates RLS recursion between team_notes and team_note_viewers (revision #7)
-- These are INTERNAL helpers - not exposed as client RPC endpoints
-- ============================================================

-- Check if user is the author of a team note (bypasses RLS)
create or replace function public.is_team_note_author(p_note_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.team_notes
    where id = p_note_id
      and author_id = auth.uid()
  );
$$;

-- Revoke all execution - internal helper only, used by RLS policies
revoke execute on function public.is_team_note_author(uuid) from public;
grant execute on function public.is_team_note_author(uuid) to authenticated;

-- Check if user is a selected viewer of a team note (bypasses RLS)
create or replace function public.is_team_note_viewer(p_note_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.team_note_viewers
    where team_note_id = p_note_id
      and user_id = auth.uid()
  );
$$;

-- Revoke all execution - internal helper only
revoke execute on function public.is_team_note_viewer(uuid) from public;
grant execute on function public.is_team_note_viewer(uuid) to authenticated;

-- Get board_id for a team note (bypasses RLS)
create or replace function public.get_team_note_board(p_note_id uuid)
returns uuid
language sql
security definer
stable
set search_path = ''
as $$
  select board_id
  from public.team_notes
  where id = p_note_id;
$$;

-- Revoke all execution - internal helper only
revoke execute on function public.get_team_note_board(uuid) from public;
grant execute on function public.get_team_note_board(uuid) to authenticated;

-- Check if a team note is published (bypasses RLS)
-- Used to prevent direct viewer changes on published notes
create or replace function public.is_team_note_published(p_note_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.team_notes
    where id = p_note_id
      and published_at is not null
  );
$$;

-- Revoke all execution - internal helper only
revoke execute on function public.is_team_note_published(uuid) from public;
grant execute on function public.is_team_note_published(uuid) to authenticated;


-- ============================================================
-- TEAM NOTES RLS (PRD 10.6) - Revised to eliminate recursion
-- Complex visibility rules:
-- - Author always sees their own notes (drafts + published)
-- - Unpublished (draft) = author-only
-- - Published + everyone = all board members
-- - Published + selected = author + viewers in team_note_viewers
-- All author operations require board membership (revision #5)
-- Publication fields protected from direct update (revision #11)
-- ============================================================

-- Author can always see their own notes (must be board member)
create policy "team_notes_select_author"
  on team_notes for select
  using (
    author_id = auth.uid()
    and public.is_board_member(board_id)
  );

-- Published 'everyone' notes visible to all board members
create policy "team_notes_select_everyone"
  on team_notes for select
  using (
    published_at is not null
    and visibility_type = 'everyone'
    and public.is_board_member(board_id)
  );

-- Published 'selected' notes visible to selected viewers who are board members
-- Uses SECURITY DEFINER helper to avoid RLS recursion (revision #6, #7)
create policy "team_notes_select_selected"
  on team_notes for select
  using (
    published_at is not null
    and visibility_type = 'selected'
    and public.is_team_note_viewer(id)
    and public.is_board_member(board_id)
  );

-- Only author can insert (as themselves, on their boards)
create policy "team_notes_insert"
  on team_notes for insert
  with check (
    author_id = auth.uid()
    and public.is_board_member(board_id)
    -- New notes must be drafts (unpublished)
    and published_at is null
    and visibility_type is null
  );

-- Only author can update their own DRAFT notes (revision #11, #16)
-- Published notes can only be updated via atomic RPCs
-- Content/metadata updates allowed on drafts only
-- Revision #16: Author CAN set visibility_type on drafts (pre-publication prep)
--               but still cannot set published_at via direct update
create policy "team_notes_update_draft"
  on team_notes for update
  using (
    author_id = auth.uid()
    and public.is_board_member(board_id)
    and published_at is null  -- Draft only
  )
  with check (
    author_id = auth.uid()
    and public.is_board_member(board_id)
    and published_at is null  -- Cannot publish via direct update
    -- visibility_type CAN be set on drafts (revision #16)
    -- Draft remains author-only until publish_team_note() is called
  );

-- Only author can delete their own notes (must be board member) (revision #5)
create policy "team_notes_delete"
  on team_notes for delete
  using (
    author_id = auth.uid()
    and public.is_board_member(board_id)
  );


-- ============================================================
-- TEAM NOTE VIEWERS RLS (PRD 10.7) - Revised to eliminate recursion
-- Only the original Team Note author may create/remove viewers
-- Uses SECURITY DEFINER helpers to avoid recursion (revision #7)
-- Direct viewer changes only allowed for unpublished notes (revision #12)
-- Published notes must use update_team_note_visibility() RPC
-- ============================================================

-- Author can see viewer list for their notes (uses helper to avoid recursion)
create policy "team_note_viewers_select_author"
  on team_note_viewers for select
  using (public.is_team_note_author(team_note_id));

-- Viewers can see they are viewers (for UI purposes)
-- Must also be board member (revision #6)
-- Revision #18: Only visible after note is published (draft config is author-only)
create policy "team_note_viewers_select_self"
  on team_note_viewers for select
  using (
    user_id = auth.uid()
    and public.is_board_member(public.get_team_note_board(team_note_id))
    and public.is_team_note_published(team_note_id)  -- Published only (revision #18)
  );

-- Only author can add viewers to UNPUBLISHED notes (revision #12)
-- Published notes must use update_team_note_visibility() RPC
create policy "team_note_viewers_insert_draft"
  on team_note_viewers for insert
  with check (
    public.is_team_note_author(team_note_id)
    and public.is_board_member(public.get_team_note_board(team_note_id))
    and not public.is_team_note_published(team_note_id)  -- Draft only
  );

-- Only author can remove viewers from UNPUBLISHED notes (revision #12)
-- Published notes must use update_team_note_visibility() RPC
create policy "team_note_viewers_delete_draft"
  on team_note_viewers for delete
  using (
    public.is_team_note_author(team_note_id)
    and not public.is_team_note_published(team_note_id)  -- Draft only
  );


-- ============================================================
-- ATOMIC TEAM NOTE PUBLICATION (revision #8, #13)
-- First publication commits content, visibility, viewers atomically
-- Content is persisted as part of the atomic transaction (revision #13)
-- Prevents intermediate states where note is published but access not set
-- ============================================================

create or replace function public.publish_team_note(
  p_note_id uuid,
  p_content jsonb,
  p_visibility team_note_visibility,
  p_selected_viewers uuid[] default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_note record;
  v_viewer_id uuid;
begin
  -- Get note details (bypasses RLS)
  select id, board_id, author_id, published_at
  into v_note
  from public.team_notes
  where id = p_note_id;

  if v_note is null then
    raise exception 'Team note not found';
  end if;

  -- Validate caller is author
  if v_note.author_id != auth.uid() then
    raise exception 'Only the author can publish this note';
  end if;

  -- Validate caller is board member
  if not public.is_board_member(v_note.board_id) then
    raise exception 'You must be a board member to publish';
  end if;

  -- Validate note is not already published
  if v_note.published_at is not null then
    raise exception 'Note is already published. Use update_team_note_visibility() to change visibility.';
  end if;

  -- Validate content is non-blank (revision #13: validate provided content)
  if p_content is null or p_content = '[]'::jsonb or p_content = '{}'::jsonb then
    raise exception 'Cannot publish a note with no content';
  end if;

  -- Validate visibility is provided
  if p_visibility is null then
    raise exception 'Visibility must be specified';
  end if;

  -- For selected visibility, validate recipients
  if p_visibility = 'selected' then
    if p_selected_viewers is null or array_length(p_selected_viewers, 1) is null then
      raise exception 'Selected visibility requires at least one viewer';
    end if;

    -- Validate all viewers are board members
    foreach v_viewer_id in array p_selected_viewers loop
      if not exists (
        select 1 from public.board_memberships
        where board_id = v_note.board_id and user_id = v_viewer_id
      ) then
        raise exception 'All selected viewers must be board members';
      end if;
    end loop;
  end if;

  -- Clear any draft-phase viewers to prevent stale authorization (revision #16)
  -- The authoritative viewer list comes from p_selected_viewers parameter
  delete from public.team_note_viewers
  where team_note_id = p_note_id;

  -- Atomic publication: update note content, visibility, and publish state together
  -- (revision #13: content is persisted atomically)
  update public.team_notes
  set
    content = p_content,
    visibility_type = p_visibility,
    published_at = now(),
    content_edited_at = now(),
    updated_at = now()
  where id = p_note_id;

  -- Insert selected viewers if applicable
  if p_visibility = 'selected' and p_selected_viewers is not null then
    insert into public.team_note_viewers (team_note_id, user_id)
    select p_note_id, unnest(p_selected_viewers);
  end if;

  return p_note_id;
end;
$$;

-- Grant execution to authenticated users - this is a client-callable RPC
revoke execute on function public.publish_team_note(uuid, jsonb, team_note_visibility, uuid[]) from public;
grant execute on function public.publish_team_note(uuid, jsonb, team_note_visibility, uuid[]) to authenticated;


-- ============================================================
-- ATOMIC VISIBILITY CHANGE (revision #9)
-- Updates visibility transactionally
-- On failure, preserves previous state
-- ============================================================

create or replace function public.update_team_note_visibility(
  p_note_id uuid,
  p_new_visibility team_note_visibility,
  p_new_viewers uuid[] default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_note record;
  v_viewer_id uuid;
begin
  -- Get note details (bypasses RLS)
  select id, board_id, author_id, published_at, visibility_type
  into v_note
  from public.team_notes
  where id = p_note_id;

  if v_note is null then
    raise exception 'Team note not found';
  end if;

  -- Validate caller is author
  if v_note.author_id != auth.uid() then
    raise exception 'Only the author can change visibility';
  end if;

  -- Validate caller is board member
  if not public.is_board_member(v_note.board_id) then
    raise exception 'You must be a board member';
  end if;

  -- Validate note is published
  if v_note.published_at is null then
    raise exception 'Cannot change visibility of unpublished note. Use publish_team_note() first.';
  end if;

  -- Validate new visibility is provided
  if p_new_visibility is null then
    raise exception 'New visibility must be specified';
  end if;

  -- For selected visibility, validate recipients
  if p_new_visibility = 'selected' then
    if p_new_viewers is null or array_length(p_new_viewers, 1) is null then
      raise exception 'Selected visibility requires at least one viewer';
    end if;

    -- Validate all viewers are board members
    foreach v_viewer_id in array p_new_viewers loop
      if not exists (
        select 1 from public.board_memberships
        where board_id = v_note.board_id and user_id = v_viewer_id
      ) then
        raise exception 'All selected viewers must be board members';
      end if;
    end loop;
  end if;

  -- Atomic visibility change
  -- First, remove existing viewers (if changing from selected)
  if v_note.visibility_type = 'selected' then
    delete from public.team_note_viewers
    where team_note_id = p_note_id;
  end if;

  -- Update visibility
  update public.team_notes
  set
    visibility_type = p_new_visibility,
    updated_at = now()
  where id = p_note_id;

  -- Insert new viewers if applicable
  if p_new_visibility = 'selected' and p_new_viewers is not null then
    insert into public.team_note_viewers (team_note_id, user_id)
    select p_note_id, unnest(p_new_viewers)
    on conflict (team_note_id, user_id) do nothing;
  end if;

  return p_note_id;
end;
$$;

-- Grant execution to authenticated users - this is a client-callable RPC
revoke execute on function public.update_team_note_visibility(uuid, team_note_visibility, uuid[]) from public;
grant execute on function public.update_team_note_visibility(uuid, team_note_visibility, uuid[]) to authenticated;


-- ============================================================
-- PUBLISHED CONTENT UPDATE (revision 3)
-- Allows author to edit content of already-published Team Note
-- Does NOT change visibility or viewer authorization
-- ============================================================

create or replace function public.update_published_team_note_content(
  p_note_id uuid,
  p_content jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_note record;
begin
  -- Get note details (bypasses RLS)
  select id, board_id, author_id, published_at
  into v_note
  from public.team_notes
  where id = p_note_id;

  if v_note is null then
    raise exception 'Team note not found';
  end if;

  -- Validate caller is author
  if v_note.author_id != auth.uid() then
    raise exception 'Only the author can edit this note';
  end if;

  -- Validate caller is board member
  if not public.is_board_member(v_note.board_id) then
    raise exception 'You must be a board member';
  end if;

  -- Validate note is already published
  if v_note.published_at is null then
    raise exception 'Note is not published. Use direct update for drafts.';
  end if;

  -- Validate content is non-blank
  if p_content is null or p_content = '[]'::jsonb or p_content = '{}'::jsonb then
    raise exception 'Content cannot be empty';
  end if;

  -- Update content and timestamps only
  -- Preserves original published_at, visibility_type, and viewer relationships
  update public.team_notes
  set
    content = p_content,
    content_edited_at = now(),
    updated_at = now()
  where id = p_note_id;

  return p_note_id;
end;
$$;

-- Grant execution to authenticated users - this is a client-callable RPC
revoke execute on function public.update_published_team_note_content(uuid, jsonb) from public;
grant execute on function public.update_published_team_note_content(uuid, jsonb) to authenticated;


-- ============================================================
-- INVARIANT ENFORCEMENT (revision #10)
-- Trigger to validate team_note_viewers correspond to valid state
-- This is a trigger function - not exposed as client RPC
-- ============================================================

create or replace function public.validate_team_note_viewer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_note record;
begin
  -- Get note details
  select visibility_type, board_id
  into v_note
  from public.team_notes
  where id = new.team_note_id;

  -- Viewer must be for a 'selected' visibility note
  if v_note.visibility_type is null or v_note.visibility_type != 'selected' then
    raise exception 'Viewers can only be added to notes with selected visibility';
  end if;

  -- Viewer must be a board member
  if not exists (
    select 1 from public.board_memberships
    where board_id = v_note.board_id and user_id = new.user_id
  ) then
    raise exception 'Viewer must be a member of the same board';
  end if;

  return new;
end;
$$;

-- Revoke all execution - this is a trigger function, not a client RPC
revoke execute on function public.validate_team_note_viewer() from public;
revoke execute on function public.validate_team_note_viewer() from authenticated;

create trigger team_note_viewers_validate
  before insert on team_note_viewers
  for each row execute function public.validate_team_note_viewer();
