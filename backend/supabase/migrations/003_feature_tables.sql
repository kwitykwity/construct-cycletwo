-- ============================================================
-- Migration: 003_feature_tables
-- Purpose: Element Authorship, History, Personal Notes, Team Notes
-- PRD Sections: 9.5-9.9, 10.3-10.7
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

-- PRD 10.3: Only owner can update their own notes
create policy "personal_notes_update"
  on personal_notes for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- PRD 10.3: Only owner can delete their own notes
create policy "personal_notes_delete"
  on personal_notes for delete
  using (owner_id = auth.uid());


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
  visibility_type team_note_visibility,  -- null until visibility chosen
  draft_created_at timestamptz not null default now(),
  published_at timestamptz,  -- null = draft, non-null = published
  content_edited_at timestamptz,
  updated_at timestamptz not null default now()
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
-- TEAM NOTES RLS (PRD 10.6)
-- Complex visibility rules:
-- - Author always sees their own notes (drafts + published)
-- - Unpublished (draft) = author-only
-- - Published + everyone = all board members
-- - Published + selected = author + viewers in team_note_viewers
-- ============================================================

-- Author can always see their own notes
create policy "team_notes_select_author"
  on team_notes for select
  using (author_id = auth.uid());

-- Published 'everyone' notes visible to all board members
create policy "team_notes_select_everyone"
  on team_notes for select
  using (
    published_at is not null
    and visibility_type = 'everyone'
    and public.is_board_member(board_id)
  );

-- Published 'selected' notes visible to selected viewers
create policy "team_notes_select_selected"
  on team_notes for select
  using (
    published_at is not null
    and visibility_type = 'selected'
    and exists (
      select 1
      from team_note_viewers
      where team_note_viewers.team_note_id = team_notes.id
        and team_note_viewers.user_id = auth.uid()
    )
  );

-- Only author can insert (as themselves, on their boards)
create policy "team_notes_insert"
  on team_notes for insert
  with check (
    author_id = auth.uid()
    and public.is_board_member(board_id)
  );

-- Only author can update their own notes
create policy "team_notes_update"
  on team_notes for update
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

-- Only author can delete their own notes
create policy "team_notes_delete"
  on team_notes for delete
  using (author_id = auth.uid());


-- ============================================================
-- TEAM NOTE VIEWERS RLS (PRD 10.7)
-- Only the original Team Note author may create/remove viewers
-- Selected viewers must be same-board members
-- ============================================================

-- Author can see viewer list for their notes
create policy "team_note_viewers_select_author"
  on team_note_viewers for select
  using (
    exists (
      select 1
      from team_notes
      where team_notes.id = team_note_viewers.team_note_id
        and team_notes.author_id = auth.uid()
    )
  );

-- Viewers can see they are viewers (for UI purposes)
create policy "team_note_viewers_select_self"
  on team_note_viewers for select
  using (user_id = auth.uid());

-- Only author can add viewers, and viewer must be board member
create policy "team_note_viewers_insert"
  on team_note_viewers for insert
  with check (
    exists (
      select 1
      from team_notes
      join board_memberships on board_memberships.board_id = team_notes.board_id
      where team_notes.id = team_note_viewers.team_note_id
        and team_notes.author_id = auth.uid()
        and board_memberships.user_id = team_note_viewers.user_id
    )
  );

-- Only author can remove viewers
create policy "team_note_viewers_delete"
  on team_note_viewers for delete
  using (
    exists (
      select 1
      from team_notes
      where team_notes.id = team_note_viewers.team_note_id
        and team_notes.author_id = auth.uid()
    )
  );
