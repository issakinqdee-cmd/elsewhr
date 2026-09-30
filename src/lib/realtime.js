import { supabase } from "./supabase";

async function requireSupabase() {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

export async function listDiscoverProfiles(currentUserId) {
  const client = await requireSupabase();
  const [{ data: profiles, error: profileError }, { data: blocks, error: blockError }] = await Promise.all([
    client
      .from("profiles")
      .select("id, username, display_name, age, country, languages, interests, bio, primary_photo_url, discoverable, verified_at, updated_at")
      .eq("discoverable", true)
      .not("primary_photo_url", "is", null)
      .neq("id", currentUserId)
      .order("updated_at", { ascending: false })
      .limit(100),
    client.from("blocks").select("blocked_id"),
  ]);
  if (profileError) throw profileError;
  if (blockError) throw blockError;

  const blocked = new Set((blocks ?? []).map(row => row.blocked_id));
  const candidates = (profiles ?? []).filter(profile => !blocked.has(profile.id));
  if (!candidates.length) return [];

  const ids = candidates.map(profile => profile.id);
  const { data: presence, error: presenceError } = await client
    .from("presence")
    .select("user_id, online, last_seen")
    .in("user_id", ids);
  if (presenceError) throw presenceError;

  const live = new Map((presence ?? []).map(row => [row.user_id, row]));
  return candidates.map(profile => ({
    ...profile,
    online: Boolean(live.get(profile.id)?.online),
    last_seen: live.get(profile.id)?.last_seen ?? null,
  }));
}

export async function listConnections(currentUserId) {
  const client = await requireSupabase();
  const { data, error } = await client
    .from("connections")
    .select("id, requester_id, receiver_id, status, created_at, updated_at")
    .or(`requester_id.eq.${currentUserId},receiver_id.eq.${currentUserId}`)
    .order("updated_at", { ascending: false });
  if (error) throw error;

  const rows = data ?? [];
  const ids = [...new Set(rows.map(row => row.requester_id === currentUserId ? row.receiver_id : row.requester_id))];
  if (!ids.length) return [];

  const { data: profiles, error: profileError } = await client
    .from("profiles")
    .select("id, username, display_name, age, country, primary_photo_url, verified_at")
    .in("id", ids);
  if (profileError) throw profileError;

  const byId = new Map((profiles ?? []).map(profile => [profile.id, profile]));
  return rows.map(row => ({
    ...row,
    person: byId.get(row.requester_id === currentUserId ? row.receiver_id : row.requester_id) ?? null,
    direction: row.requester_id === currentUserId ? "outgoing" : "incoming",
  })).filter(row => row.person);
}

export async function listRooms(currentUserId) {
  const client = await requireSupabase();
  const { data: memberships, error: membershipError } = await client
    .from("room_members")
    .select("room_id, user_id, joined_at, left_at")
    .eq("user_id", currentUserId)
    .is("left_at", null);
  if (membershipError) throw membershipError;

  const ownRoomIds = (memberships ?? []).map(row => row.room_id);
  const query = ownRoomIds.length
    ? client.from("rooms").select("id, kind, status, created_by, created_at, ended_at, title, description").or(`status.eq.active,id.in.(${ownRoomIds.join(",")})`).order("created_at", { ascending: false }).limit(100)
    : client.from("rooms").select("id, kind, status, created_by, created_at, ended_at, title, description").eq("kind", "group").eq("status", "active").order("created_at", { ascending: false }).limit(100);

  const { data: rooms, error } = await query;
  if (error) throw error;

  const roomIds = (rooms ?? []).map(room => room.id);
  if (!roomIds.length) return [];

  const { data: roomMembers, error: roomMemberError } = await client
    .from("room_members")
    .select("room_id, user_id, joined_at, left_at")
    .in("room_id", roomIds)
    .is("left_at", null);
  if (roomMemberError) throw roomMemberError;

  const personIds = [...new Set((roomMembers ?? []).map(row => row.user_id).filter(id => id !== currentUserId))];
  let profiles = [];
  if (personIds.length) {
    const { data, error: profileError } = await client
      .from("profiles")
      .select("id, username, display_name, age, country, primary_photo_url, verified_at")
      .in("id", personIds);
    if (profileError) throw profileError;
    profiles = data ?? [];
  }

  const profileById = new Map(profiles.map(profile => [profile.id, profile]));
  const membersByRoom = new Map();
  (roomMembers ?? []).forEach(member => {
    if (!membersByRoom.has(member.room_id)) membersByRoom.set(member.room_id, []);
    membersByRoom.get(member.room_id).push({ ...member, profile: profileById.get(member.user_id) ?? null });
  });

  const { data: recentMessages, error: messageError } = await client
    .from("messages")
    .select("id, room_id, sender_id, body, media_type, created_at, edited_at, deleted_at")
    .in("room_id", roomIds)
    .order("created_at", { ascending: false })
    .limit(250);
  if (messageError) throw messageError;

  const { data: hiddenMessages, error: hiddenError } = await client
    .from("message_deletions")
    .select("message_id");
  if (hiddenError) throw hiddenError;
  const hiddenIds = new Set((hiddenMessages ?? []).map(row => row.message_id));

  const latest = new Map();
  (recentMessages ?? []).forEach(row => {
    if (hiddenIds.has(row.id)) return;
    if (row.deleted_at) return;
    if (!latest.has(row.room_id)) latest.set(row.room_id, row);
  });

  return (rooms ?? []).map(room => ({
    ...room,
    members: membersByRoom.get(room.id) ?? [],
    latest_message: latest.get(room.id) ?? null,
  }));
}

export async function getRoom(roomId) {
  const client = await requireSupabase();
  const { data: room, error } = await client
    .from("rooms")
    .select("id, kind, status, created_by, created_at, ended_at, title, description")
    .eq("id", roomId)
    .single();
  if (error) throw error;

  const { data: members, error: memberError } = await client
    .from("room_members")
    .select("room_id, user_id, joined_at, left_at")
    .eq("room_id", roomId)
    .is("left_at", null);
  if (memberError) throw memberError;

  const ids = (members ?? []).map(member => member.user_id);
  let profiles = [];
  if (ids.length) {
    const { data, error: profileError } = await client
      .from("profiles")
      .select("id, username, display_name, age, country, primary_photo_url, verified_at, bio")
      .in("id", ids);
    if (profileError) throw profileError;
    profiles = data ?? [];
  }

  const byId = new Map(profiles.map(profile => [profile.id, profile]));
  return { ...room, members: (members ?? []).map(member => ({ ...member, profile: byId.get(member.user_id) ?? null })) };
}

export async function listMessages(roomId) {
  const client = await requireSupabase();
  const { data: messages, error: messageError } = await client
    .from("messages")
    .select("id, room_id, sender_id, body, media_type, created_at, edited_at, deleted_at, reply_to_id")
    .eq("room_id", roomId)
    .order("created_at", { ascending: true })
    .limit(500);
  if (messageError) throw messageError;

  const messageIds = (messages ?? []).map(row => row.id);
  const [reactionResult, hiddenResult] = await Promise.all([
    messageIds.length
      ? client.from("message_reactions").select("message_id, user_id, reaction, created_at").in("message_id", messageIds)
      : Promise.resolve({ data: [], error: null }),
    client.from("message_deletions").select("message_id"),
  ]);
  if (reactionResult.error) throw reactionResult.error;
  if (hiddenResult.error) throw hiddenResult.error;

  const hiddenIds = new Set((hiddenResult.data ?? []).map(row => row.message_id));
  const reactionMap = new Map();
  (reactionResult.data ?? []).forEach(row => {
    if (!reactionMap.has(row.message_id)) reactionMap.set(row.message_id, []);
    reactionMap.get(row.message_id).push(row);
  });

  return (messages ?? [])
    .filter(message => !hiddenIds.has(message.id))
    .map(message => ({
      ...message,
      reactions: reactionMap.get(message.id) ?? [],
    }));
}

export async function sendTextMessage(roomId, senderId, body, replyToId = null) {
  const client = await requireSupabase();
  const { data, error } = await client
    .from("messages")
    .insert({
      room_id: roomId,
      sender_id: senderId,
      body: body.trim(),
      reply_to_id: replyToId || null,
    })
    .select("id, room_id, sender_id, body, media_type, created_at, edited_at, deleted_at, reply_to_id")
    .single();
  if (error) throw error;
  return data;
}

export async function editTextMessage(messageId, senderId, body) {
  const client = await requireSupabase();
  const nextBody = body.trim();
  if (!nextBody) throw new Error("Message cannot be empty.");
  const { data, error } = await client
    .from("messages")
    .update({ body: nextBody, edited_at: new Date().toISOString() })
    .eq("id", messageId)
    .eq("sender_id", senderId)
    .is("deleted_at", null)
    .select("id, room_id, sender_id, body, media_type, created_at, edited_at, deleted_at, reply_to_id")
    .single();
  if (error) throw error;
  return data;
}

export async function deleteMessageForMe(messageId, userId) {
  const client = await requireSupabase();
  const { error } = await client
    .from("message_deletions")
    .upsert({ message_id: messageId, user_id: userId }, { onConflict: "message_id,user_id" });
  if (error) throw error;
}

export async function deleteMessageForEveryone(messageId, senderId) {
  const client = await requireSupabase();
  const { data, error } = await client
    .from("messages")
    .update({
      body: null,
      media_type: null,
      media_path: null,
      edited_at: null,
      deleted_at: new Date().toISOString(),
    })
    .eq("id", messageId)
    .eq("sender_id", senderId)
    .is("deleted_at", null)
    .select("id, room_id, sender_id, body, media_type, created_at, edited_at, deleted_at, reply_to_id")
    .single();
  if (error) throw error;
  return data;
}

export async function toggleMessageReaction(messageId, userId, reaction) {
  const client = await requireSupabase();
  const { data: existing, error: existingError } = await client
    .from("message_reactions")
    .select("message_id, user_id, reaction")
    .eq("message_id", messageId)
    .eq("user_id", userId)
    .eq("reaction", reaction)
    .maybeSingle();
  if (existingError) throw existingError;

  if (existing) {
    const { error } = await client
      .from("message_reactions")
      .delete()
      .eq("message_id", messageId)
      .eq("user_id", userId)
      .eq("reaction", reaction);
    if (error) throw error;
    return false;
  }

  const { error } = await client
    .from("message_reactions")
    .insert({ message_id: messageId, user_id: userId, reaction });
  if (error) throw error;
  return true;
}

export async function connectToUser(currentUserId, targetUserId) {
  const client = await requireSupabase();
  const { data, error } = await client
    .from("connections")
    .upsert({ requester_id: currentUserId, receiver_id: targetUserId, status: "pending" }, { onConflict: "requester_id,receiver_id" })
    .select("id, requester_id, receiver_id, status, created_at, updated_at")
    .single();
  if (error) throw error;
  return data;
}

export async function updateConnection(connectionId, status) {
  const client = await requireSupabase();
  const { data, error } = await client
    .from("connections")
    .update({ status })
    .eq("id", connectionId)
    .select("id, requester_id, receiver_id, status, created_at, updated_at")
    .single();
  if (error) throw error;
  return data;
}

export async function findOrCreateDirectRoom(targetUserId) {
  const client = await requireSupabase();
  const { data, error } = await client.rpc("get_or_create_direct_room", { target_user: targetUserId });
  if (error) throw error;
  return data;
}

export async function joinRandomQueue() {
  const client = await requireSupabase();
  const { data, error } = await client.rpc("join_random_queue");
  if (error) throw error;
  return data;
}

export async function leaveRandomQueue() {
  const client = await requireSupabase();
  const { data, error } = await client.rpc("leave_random_queue");
  if (error) throw error;
  return data;
}

export async function createGroupRoom(userId, title, description) {
  const client = await requireSupabase();
  const { data: room, error } = await client
    .from("rooms")
    .insert({ kind: "group", status: "active", created_by: userId, title: title.trim(), description: description.trim() || null })
    .select("id, kind, status, created_by, created_at, ended_at, title, description")
    .single();
  if (error) throw error;

  const { error: memberError } = await client.from("room_members").insert({ room_id: room.id, user_id: userId });
  if (memberError) {
    await client.from("rooms").delete().eq("id", room.id);
    throw memberError;
  }
  return room;
}

export async function joinRoom(roomId, userId) {
  const client = await requireSupabase();
  const { error } = await client
    .from("room_members")
    .upsert({ room_id: roomId, user_id: userId, left_at: null }, { onConflict: "room_id,user_id" });
  if (error) throw error;
}

export async function leaveRoom(roomId, userId) {
  const client = await requireSupabase();
  const { error } = await client.from("room_members")
    .update({ left_at: new Date().toISOString() })
    .eq("room_id", roomId)
    .eq("user_id", userId);
  if (error) throw error;
}

export async function reportUser(reporterId, reportedUserId, roomId, reason) {
  const client = await requireSupabase();
  const { error } = await client.from("reports")
    .insert({ reporter_id: reporterId, reported_user_id: reportedUserId || null, room_id: roomId || null, reason });
  if (error) throw error;
}

export async function blockUser(blockerId, blockedUserId) {
  const client = await requireSupabase();
  const { error } = await client.from("blocks")
    .upsert({ blocker_id: blockerId, blocked_id: blockedUserId }, { onConflict: "blocker_id,blocked_id" });
  if (error) throw error;
}

export async function touchPresence(online = true) {
  const client = await requireSupabase();
  const { error } = await client.rpc("touch_presence", { p_online: online });
  if (error) throw error;
}
