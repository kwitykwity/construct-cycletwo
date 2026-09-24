-- ============================================================
-- Migration: 004_session_handoffs
-- Purpose: Shared board-level Session Handoff
-- One handoff per board, visible and editable by board members
-- ============================================================

create table session_handoffs (
  board_id uuid primary key references boards(id) on delete cascade,
  left_off text not null default '',
  whats_next text not null default '',
  owner_name text not null default '',
  updated_by uuid not null references auth.users(id),
  updated_by_name text not null default '',
  updated_at timestamptz not null default now()
);

alter table session_handoffs enable row level security;

-- Board members may read the shared handoff
create policy "session_handoffs_select"
  on session_handoffs for select
  using (
    public.is_board_member(board_id)
  );

-- Board members may create the handoff as themselves
create policy "session_handoffs_insert"
  on session_handoffs for insert
  with check (
    updated_by = auth.uid()
    and public.is_board_member(board_id)
  );

-- Board members may update the shared handoff as themselves
create policy "session_handoffs_update"
  on session_handoffs for update
  using (
    public.is_board_member(board_id)
  )
  with check (
    updated_by = auth.uid()
    and public.is_board_member(board_id)
  );

grant select, insert, update
  on public.session_handoffs
  to authenticated;