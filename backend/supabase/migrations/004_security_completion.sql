-- ============================================================
-- Migration: 004_security_completion
-- Purpose: Complete authenticated privileges and controlled
--          authorization paths required by the locked PRD
-- PRD Sections: 10.1-10.16
-- ============================================================

-- ------------------------------------------------------------
-- Authenticated privileges for immutable feature tables.
-- RLS remains the authorization boundary.
-- No UPDATE or DELETE privileges are granted for authorship
-- or history because those records are immutable/append-only.
-- ------------------------------------------------------------

grant select, insert
  on public.element_authorship
  to authenticated;

grant select, insert
  on public.history_events
  to authenticated;

-- ------------------------------------------------------------
-- Personal Notes.
-- Authenticated users receive CRUD table privileges while RLS
-- restricts operations to the authenticated owner's own notes.
-- ------------------------------------------------------------

grant select, insert, update, delete
  on public.personal_notes
  to authenticated;

-- ------------------------------------------------------------
-- Auth/Profile/Board reads.
-- Board membership creation remains controlled by resolve_board().
-- ------------------------------------------------------------

grant select, update
  on public.profiles
  to authenticated;

grant select
  on public.boards
  to authenticated;

grant select
  on public.board_memberships
  to authenticated;

-- ------------------------------------------------------------
-- Team Notes security helpers.
-- ------------------------------------------------------------

create or replace function public.get_team_note_board(p_note_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select board_id
  from public.team_notes
  where id = p_note_id;
$$;

create or replace function public.is_team_note_author(p_note_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.team_notes
    where id = p_note_id
      and author_id = auth.uid()
  );
$$;

create or replace function public.is_team_note_published(p_note_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.team_notes
    where id = p_note_id
      and published_at is not null
  );
$$;

create or replace function public.is_team_note_viewer(p_note_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.team_note_viewers
    where team_note_id = p_note_id
      and user_id = auth.uid()
  );
$$;

-- ------------------------------------------------------------
-- Team Notes controlled publication and update functions.
-- ------------------------------------------------------------

create or replace function public.publish_team_note(
  p_note_id uuid,
  p_content jsonb,
  p_visibility team_note_visibility,
  p_selected_viewers uuid[] default null::uuid[]
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
  select id, board_id, author_id, published_at
  into v_note
  from public.team_notes
  where id = p_note_id;

  if v_note is null then
    raise exception 'Team note not found';
  end if;

  if v_note.author_id != auth.uid() then
    raise exception 'Only the author can publish this note';
  end if;

  if not public.is_board_member(v_note.board_id) then
    raise exception 'You must be a board member to publish';
  end if;

  if v_note.published_at is not null then
    raise exception 'Note is already published. Use update_team_note_visibility() to change visibility.';
  end if;

  if p_content is null or p_content = '[]'::jsonb or p_content = '{}'::jsonb then
    raise exception 'Cannot publish a note with no content';
  end if;

  if p_visibility is null then
    raise exception 'Visibility must be specified';
  end if;

  if p_visibility = 'selected' then
    if p_selected_viewers is null or array_length(p_selected_viewers, 1) is null then
      raise exception 'Selected visibility requires at least one viewer';
    end if;

    foreach v_viewer_id in array p_selected_viewers loop
      if not exists (
        select 1
        from public.board_memberships
        where board_id = v_note.board_id
          and user_id = v_viewer_id
      ) then
        raise exception 'All selected viewers must be board members';
      end if;
    end loop;
  end if;

  delete from public.team_note_viewers
  where team_note_id = p_note_id;

  update public.team_notes
  set content = p_content,
      visibility_type = p_visibility,
      published_at = now(),
      content_edited_at = now(),
      updated_at = now()
  where id = p_note_id;

  if p_visibility = 'selected' and p_selected_viewers is not null then
    insert into public.team_note_viewers(team_note_id, user_id)
    select p_note_id, unnest(p_selected_viewers);
  end if;

  return p_note_id;
end;
$$;

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
  select id, board_id, author_id, published_at
  into v_note
  from public.team_notes
  where id = p_note_id;

  if v_note is null then
    raise exception 'Team note not found';
  end if;

  if v_note.author_id != auth.uid() then
    raise exception 'Only the author can edit this note';
  end if;

  if not public.is_board_member(v_note.board_id) then
    raise exception 'You must be a board member';
  end if;

  if v_note.published_at is null then
    raise exception 'Note is not published. Use direct update for drafts.';
  end if;

  if p_content is null or p_content = '[]'::jsonb or p_content = '{}'::jsonb then
    raise exception 'Content cannot be empty';
  end if;

  update public.team_notes
  set content = p_content,
      content_edited_at = now(),
      updated_at = now()
  where id = p_note_id;

  return p_note_id;
end;
$$;

create or replace function public.update_team_note_visibility(
  p_note_id uuid,
  p_new_visibility team_note_visibility,
  p_new_viewers uuid[] default null::uuid[]
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
  select id, board_id, author_id, published_at, visibility_type
  into v_note
  from public.team_notes
  where id = p_note_id;

  if v_note is null then
    raise exception 'Team note not found';
  end if;

  if v_note.author_id != auth.uid() then
    raise exception 'Only the author can change visibility';
  end if;

  if not public.is_board_member(v_note.board_id) then
    raise exception 'You must be a board member';
  end if;

  if v_note.published_at is null then
    raise exception 'Cannot change visibility of unpublished note. Use publish_team_note() first.';
  end if;

  if p_new_visibility is null then
    raise exception 'New visibility must be specified';
  end if;

  if p_new_visibility = 'selected' then
    if p_new_viewers is null or array_length(p_new_viewers, 1) is null then
      raise exception 'Selected visibility requires at least one viewer';
    end if;

    foreach v_viewer_id in array p_new_viewers loop
      if not exists (
        select 1
        from public.board_memberships
        where board_id = v_note.board_id
          and user_id = v_viewer_id
      ) then
        raise exception 'All selected viewers must be board members';
      end if;
    end loop;
  end if;

  if v_note.visibility_type = 'selected' then
    delete from public.team_note_viewers
    where team_note_id = p_note_id;
  end if;

  update public.team_notes
  set visibility_type = p_new_visibility,
      updated_at = now()
  where id = p_note_id;

  if p_new_visibility = 'selected' and p_new_viewers is not null then
    insert into public.team_note_viewers(team_note_id, user_id)
    select p_note_id, unnest(p_new_viewers)
    on conflict(team_note_id, user_id) do nothing;
  end if;

  return p_note_id;
end;
$$;

-- ------------------------------------------------------------
-- Team Note viewer validation.
-- ------------------------------------------------------------

create or replace function public.validate_team_note_viewer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_note record;
begin
  select visibility_type, board_id
  into v_note
  from public.team_notes
  where id = new.team_note_id;

  if v_note.visibility_type is null or v_note.visibility_type != 'selected' then
    raise exception 'Viewers can only be added to notes with selected visibility';
  end if;

  if not exists (
    select 1
    from public.board_memberships
    where board_id = v_note.board_id
      and user_id = new.user_id
  ) then
    raise exception 'Viewer must be a member of the same board';
  end if;

  return new;
end;
$$;

drop trigger if exists team_note_viewers_validate on public.team_note_viewers;

create trigger team_note_viewers_validate
before insert on public.team_note_viewers
for each row
execute function public.validate_team_note_viewer();

-- ------------------------------------------------------------
-- Team Notes RLS hardening.
-- Replace Migration 003 policies with verified live behavior.
-- ------------------------------------------------------------

-- Replace the original Team Notes policies from Migration 003.
drop policy if exists "team_notes_select_author" on public.team_notes;
drop policy if exists "team_notes_select_everyone" on public.team_notes;
drop policy if exists "team_notes_select_selected" on public.team_notes;
drop policy if exists "team_notes_insert" on public.team_notes;
drop policy if exists "team_notes_update" on public.team_notes;
drop policy if exists "team_notes_delete" on public.team_notes;
drop policy if exists "team_notes_update_draft" on public.team_notes;
drop policy if exists "team_note_viewers_insert_draft" on public.team_note_viewers;
drop policy if exists "team_note_viewers_delete_draft" on public.team_note_viewers;

create policy "team_notes_select_author"
  on public.team_notes for select
  using (
    author_id = auth.uid()
    and public.is_board_member(board_id)
  );

create policy "team_notes_select_everyone"
  on public.team_notes for select
  using (
    published_at is not null
    and visibility_type = 'everyone'
    and public.is_board_member(board_id)
  );

create policy "team_notes_select_selected"
  on public.team_notes for select
  using (
    published_at is not null
    and visibility_type = 'selected'
    and public.is_team_note_viewer(id)
    and public.is_board_member(board_id)
  );

create policy "team_notes_insert"
  on public.team_notes for insert
  with check (
    author_id = auth.uid()
    and public.is_board_member(board_id)
    and published_at is null
    and visibility_type is null
  );

create policy "team_notes_update_draft"
  on public.team_notes for update
  using (
    author_id = auth.uid()
    and public.is_board_member(board_id)
    and published_at is null
  )
  with check (
    author_id = auth.uid()
    and public.is_board_member(board_id)
    and published_at is null
  );

create policy "team_notes_delete"
  on public.team_notes for delete
  using (
    author_id = auth.uid()
    and public.is_board_member(board_id)
  );

-- Replace the original Team Note viewer policies from Migration 003.
drop policy if exists "team_note_viewers_select_author" on public.team_note_viewers;
drop policy if exists "team_note_viewers_select_self" on public.team_note_viewers;
drop policy if exists "team_note_viewers_insert" on public.team_note_viewers;
drop policy if exists "team_note_viewers_delete" on public.team_note_viewers;

create policy "team_note_viewers_select_author"
  on public.team_note_viewers for select
  using (
    public.is_team_note_author(team_note_id)
  );

create policy "team_note_viewers_select_self"
  on public.team_note_viewers for select
  using (
    user_id = auth.uid()
    and public.is_board_member(public.get_team_note_board(team_note_id))
    and public.is_team_note_published(team_note_id)
  );

create policy "team_note_viewers_insert_draft"
  on public.team_note_viewers for insert
  with check (
    public.is_team_note_author(team_note_id)
    and public.is_board_member(public.get_team_note_board(team_note_id))
    and not public.is_team_note_published(team_note_id)
  );

create policy "team_note_viewers_delete_draft"
  on public.team_note_viewers for delete
  using (
    public.is_team_note_author(team_note_id)
    and not public.is_team_note_published(team_note_id)
  );

-- Team Notes table privileges.
-- RLS limits direct updates/viewer changes to the approved paths.
grant select, insert, update, delete on public.team_notes to authenticated;
grant select, insert, delete on public.team_note_viewers to authenticated;

-- ------------------------------------------------------------
-- Team Notes function privilege hardening.
-- ------------------------------------------------------------

revoke all on function public.get_team_note_board(uuid) from public;
revoke all on function public.is_team_note_author(uuid) from public;
revoke all on function public.is_team_note_published(uuid) from public;
revoke all on function public.is_team_note_viewer(uuid) from public;
revoke all on function public.publish_team_note(uuid, jsonb, team_note_visibility, uuid[]) from public;
revoke all on function public.update_published_team_note_content(uuid, jsonb) from public;
revoke all on function public.update_team_note_visibility(uuid, team_note_visibility, uuid[]) from public;
revoke all on function public.validate_team_note_viewer() from public;

grant execute on function public.get_team_note_board(uuid) to authenticated;
grant execute on function public.is_team_note_author(uuid) to authenticated;
grant execute on function public.is_team_note_published(uuid) to authenticated;
grant execute on function public.is_team_note_viewer(uuid) to authenticated;
grant execute on function public.publish_team_note(uuid, jsonb, team_note_visibility, uuid[]) to authenticated;
grant execute on function public.update_published_team_note_content(uuid, jsonb) to authenticated;
grant execute on function public.update_team_note_visibility(uuid, team_note_visibility, uuid[]) to authenticated;
