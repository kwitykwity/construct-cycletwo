import { getCollaborationLinkData } from "./index";
import { supabase } from "./supabase";

export const getExcalidrawRoomId = (link: string): string | null => {
  const collaborationData = getCollaborationLinkData(link);

  if (!collaborationData) {
    return null;
  }

  return collaborationData.roomId;
};

export const getBoardIdForRoom = async (
  roomId: string,
): Promise<string> => {
  const { data, error } = await supabase.rpc("resolve_board", {
    p_excalidraw_room_id: roomId,
  });

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error("Unable to resolve board.");
  }

  return data;
};