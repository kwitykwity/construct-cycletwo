import { supabase } from "./supabase";

export type TeamNoteVisibility = "everyone" | "selected";

export interface TeamNote {
  id: string;
  boardId: string;
  authorId: string;
  content: string;
  visibility: TeamNoteVisibility | null;
  draftCreatedAt: string;
  publishedAt: string | null;
  contentEditedAt: string | null;
  updatedAt: string;
}

const mapTeamNote = (row: any): TeamNote => ({
  id: row.id,
  boardId: row.board_id,
  authorId: row.author_id,
  content: typeof row.content === "string" ? row.content : row.content?.html ?? "",
  visibility: row.visibility_type,
  draftCreatedAt: row.draft_created_at,
  publishedAt: row.published_at,
  contentEditedAt: row.content_edited_at,
  updatedAt: row.updated_at,
});

const contentJson = (content: string) => ({ html: content });

export const loadTeamNotes = async (boardId: string): Promise<TeamNote[]> => {
  const { data, error } = await supabase
    .from("team_notes")
    .select(
      "id, board_id, author_id, content, visibility_type, draft_created_at, published_at, content_edited_at, updated_at",
    )
    .eq("board_id", boardId)
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(`Could not load Team Notes: ${error.message}`);
  }

  return (data ?? []).map(mapTeamNote);
};

export const createTeamNoteDraft = async (
  boardId: string,
): Promise<TeamNote> => {
  const { data: auth, error: authError } = await supabase.auth.getUser();

  if (authError || !auth.user) {
    throw new Error("You must be signed in to create a Team Note.");
  }

  const { data, error } = await supabase
    .from("team_notes")
    .insert({
      board_id: boardId,
      author_id: auth.user.id,
      content: contentJson(""),
    })
    .select(
      "id, board_id, author_id, content, visibility_type, draft_created_at, published_at, content_edited_at, updated_at",
    )
    .single();

  if (error) {
    throw new Error(`Could not create Team Note: ${error.message}`);
  }

  return mapTeamNote(data);
};

export const saveTeamNoteDraft = async (
  noteId: string,
  content: string,
): Promise<void> => {
  const { error } = await supabase
    .from("team_notes")
    .update({
      content: contentJson(content),
      updated_at: new Date().toISOString(),
    })
    .eq("id", noteId)
    .is("published_at", null);

  if (error) {
    throw new Error(`Could not save Team Note draft: ${error.message}`);
  }
};

export const publishTeamNote = async (
  noteId: string,
  content: string,
  visibility: TeamNoteVisibility,
  selectedViewerIds: string[] = [],
): Promise<void> => {
  const { error } = await supabase.rpc("publish_team_note", {
    p_note_id: noteId,
    p_content: contentJson(content),
    p_visibility: visibility,
    p_selected_viewers: visibility === "selected" ? selectedViewerIds : null,
  });

  if (error) {
    throw new Error(`Could not publish Team Note: ${error.message}`);
  }
};

export const updatePublishedTeamNoteContent = async (
  noteId: string,
  content: string,
): Promise<void> => {
  const { error } = await supabase.rpc("update_published_team_note_content", {
    p_note_id: noteId,
    p_content: contentJson(content),
  });

  if (error) {
    throw new Error(`Could not update Team Note: ${error.message}`);
  }
};

export const updateTeamNoteVisibility = async (
  noteId: string,
  visibility: TeamNoteVisibility,
  selectedViewerIds: string[] = [],
): Promise<void> => {
  const { error } = await supabase.rpc("update_team_note_visibility", {
    p_note_id: noteId,
    p_new_visibility: visibility,
    p_new_viewers: visibility === "selected" ? selectedViewerIds : null,
  });

  if (error) {
    throw new Error(`Could not change Team Note visibility: ${error.message}`);
  }
};

export const deleteTeamNote = async (noteId: string): Promise<void> => {
  const { error } = await supabase.from("team_notes").delete().eq("id", noteId);

  if (error) {
    throw new Error(`Could not delete Team Note: ${error.message}`);
  }
};

export interface TeamNoteBoardMember {
  userId: string;
  firstName: string;
  lastName: string;
}

export const loadTeamNoteBoardMembers = async (
  boardId: string,
): Promise<TeamNoteBoardMember[]> => {
  const { data: memberships, error: membershipError } = await supabase
    .from("board_memberships")
    .select("user_id")
    .eq("board_id", boardId);

  if (membershipError) {
    throw new Error(
      `Could not load board members: ${membershipError.message}`,
    );
  }

  const userIds = (memberships ?? []).map((membership) => membership.user_id);

  if (userIds.length === 0) {
    return [];
  }

  const { data: profiles, error: profileError } = await supabase
    .from("profiles")
    .select("user_id, first_name, last_name")
    .in("user_id", userIds);

  if (profileError) {
    throw new Error(`Could not load member profiles: ${profileError.message}`);
  }

  return (profiles ?? []).map((profile) => ({
    userId: profile.user_id,
    firstName: profile.first_name,
    lastName: profile.last_name,
  }));
};

export const loadTeamNoteViewerIds = async (
  noteId: string,
): Promise<string[]> => {
  const { data, error } = await supabase
    .from("team_note_viewers")
    .select("user_id")
    .eq("team_note_id", noteId);

  if (error) {
    throw new Error(`Could not load Team Note viewers: ${error.message}`);
  }

  return (data ?? []).map((viewer) => viewer.user_id);
};
