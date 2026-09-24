import { supabase } from "./supabase";

export interface PersonalNote {
  id: string;
  boardId: string;
  ownerId: string;
  content: string;
  createdAt: string;
  contentEditedAt: string | null;
  updatedAt: string;
}

const mapPersonalNote = (row: any): PersonalNote => ({
  id: row.id,
  boardId: row.board_id,
  ownerId: row.owner_id,
  content:
    typeof row.content === "string" ? row.content : row.content?.html ?? "",
  createdAt: row.created_at,
  contentEditedAt: row.content_edited_at,
  updatedAt: row.updated_at,
});

const contentJson = (content: string) => ({ html: content });

export const loadPersonalNotes = async (
  boardId: string,
): Promise<PersonalNote[]> => {
  const { data, error } = await supabase
    .from("personal_notes")
    .select(
      "id, board_id, owner_id, content, created_at, content_edited_at, updated_at",
    )
    .eq("board_id", boardId)
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(`Could not load Personal Notes: ${error.message}`);
  }

  return (data ?? []).map(mapPersonalNote);
};

export const createPersonalNote = async (
  boardId: string,
): Promise<PersonalNote> => {
  const { data: auth, error: authError } = await supabase.auth.getUser();

  if (authError || !auth.user) {
    throw new Error("You must be signed in to create a Personal Note.");
  }

  const { data, error } = await supabase
    .from("personal_notes")
    .insert({
      board_id: boardId,
      owner_id: auth.user.id,
      content: contentJson(""),
    })
    .select(
      "id, board_id, owner_id, content, created_at, content_edited_at, updated_at",
    )
    .single();

  if (error) {
    throw new Error(`Could not create Personal Note: ${error.message}`);
  }

  return mapPersonalNote(data);
};

export const savePersonalNote = async (
  noteId: string,
  content: string,
): Promise<void> => {
  const now = new Date().toISOString();

  const { error } = await supabase
    .from("personal_notes")
    .update({
      content: contentJson(content),
      content_edited_at: now,
      updated_at: now,
    })
    .eq("id", noteId);

  if (error) {
    throw new Error(`Could not save Personal Note: ${error.message}`);
  }
};

export const deletePersonalNote = async (
  noteId: string,
): Promise<void> => {
  const { error } = await supabase
    .from("personal_notes")
    .delete()
    .eq("id", noteId);

  if (error) {
    throw new Error(`Could not delete Personal Note: ${error.message}`);
  }
};
