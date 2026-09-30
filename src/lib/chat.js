import { supabase } from "./supabase";

export async function loadRoomMessages(roomId) {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("messages")
    .select("id, room_id, sender_id, body, media_type, media_path, view_once, expires_at, created_at")
    .eq("room_id", roomId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export function subscribeToRoomMessages(roomId, onInsert) {
  if (!supabase) return () => {};

  const channel = supabase
    .channel(`room:${roomId}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "messages", filter: `room_id=eq.${roomId}` },
      (payload) => onInsert(payload.new),
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

export async function sendMessage({ roomId, senderId, body }) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase
    .from("messages")
    .insert({ room_id: roomId, sender_id: senderId, body })
    .select()
    .single();

  if (error) throw error;
  return data;
}
