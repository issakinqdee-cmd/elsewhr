import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { supabase, supabaseConfigured } from "./lib/supabase";
import {
  blockUser,
  connectToUser,
  createGroupRoom,
  findOrCreateDirectRoom,
  getRoom,
  joinRandomQueue,
  joinRoom,
  leaveRandomQueue,
  leaveRoom,
  listConnections,
  listDiscoverProfiles,
  listMessages,
  listRooms,
  reportUser,
  sendTextMessage,
  editTextMessage,
  deleteMessageForMe,
  deleteMessageForEveryone,
  toggleMessageReaction,
  uploadRoomAttachment,
  touchPresence,
  updateConnection,
} from "./lib/realtime";
import {
  deleteAccount,
  getCurrentUser,
  getProfile,
  saveProfile,
  signInAnonymously,
  signInWithEmail,
  signOut,
  signUpWithEmail,
  uploadAvatar,
} from "./lib/account";
import { startPaypalSubscription } from "./lib/paypal";

const ICON_BASE = "https://api.iconify.design/lucide:";

function Icon({ name, size = 18, alt = "" }) {
  const png = ICON_BASE + name + ".png?color=%23b7b9b1&width=" + size + "&height=" + size;
  const svg = ICON_BASE + name + ".svg?color=%23b7b9b1&width=" + size + "&height=" + size;
  return <img className="ui-icon" src={png} onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = svg; }} width={size} height={size} alt={alt} aria-hidden={!alt} />;
}

function BrandMark({ size = 28 }) {
  return (
    <span className="brand-mark" style={{ width: size, height: size }}>
      <svg viewBox="0 0 32 32" width={Math.round(size * 0.72)} height={Math.round(size * 0.72)} aria-hidden="true">
        <text x="14.5" y="24.5" textAnchor="middle" fontFamily="Allura, cursive" fontSize="28" fill="currentColor">E</text>
        <path d="M18.5 23.5 C21.8 27.4 26.4 26.3 28 22.2" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    </span>
  );
}

const PAGE_ORDER = ["home", "random", "discover", "connections", "messages", "rooms", "games"];

function initials(person) {
  const label = person?.display_name || person?.username || "E";
  return label.slice(0, 1).toUpperCase();
}

function personName(person) {
  return person?.display_name || person?.username || "ELSEWHR member";
}

function timeLabel(value) {
  if (!value) return "";
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function App() {
  const [page, setPage] = useState("home");
  const [pageMotion, setPageMotion] = useState("forward");
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem("elsewhr-theme") || "dark";
    } catch {
      return "dark";
    }
  });
  const [authUser, setAuthUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [authMode, setAuthMode] = useState("signin");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [accountError, setAccountError] = useState("");
  const [showWelcome, setShowWelcome] = useState(true);
  const [showAuthForm, setShowAuthForm] = useState(false);
  const [showAdvancedProfileFields, setShowAdvancedProfileFields] = useState(false);

  const [profile, setProfile] = useState(null);
  const [profileFile, setProfileFile] = useState(null);
  const [profilePreview, setProfilePreview] = useState("");
  const [showProfile, setShowProfile] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const [discoverPeople, setDiscoverPeople] = useState([]);
  const [connections, setConnections] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [activeRoom, setActiveRoom] = useState(null);
  const [activeMessages, setActiveMessages] = useState([]);
  const [message, setMessage] = useState("");
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const [notificationPanel, setNotificationPanel] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [replyToMessage, setReplyToMessage] = useState(null);
  const [openMessageActionsId, setOpenMessageActionsId] = useState(null);
  const [openReactionId, setOpenReactionId] = useState(null);
  const [dataBusy, setDataBusy] = useState(false);
  const [dataError, setDataError] = useState("");

  const [discoverOnlineOnly, setDiscoverOnlineOnly] = useState(false);
  const [discoverVerifiedOnly, setDiscoverVerifiedOnly] = useState(false);
  const [discoverIndex, setDiscoverIndex] = useState(0);
  const [viewedProfile, setViewedProfile] = useState(null);

  const [isMatching, setIsMatching] = useState(false);
  const [matchingSince, setMatchingSince] = useState(null);
  const [siteOnlineCount, setSiteOnlineCount] = useState(0);

  const [roomTitle, setRoomTitle] = useState("");
  const [roomDescription, setRoomDescription] = useState("");
  const [roomBusy, setRoomBusy] = useState(false);

  const [showPlus, setShowPlus] = useState(false);
  const [plusPlan, setPlusPlan] = useState("monthly");
  const [game, setGame] = useState(null);
  const [rpsChoice, setRpsChoice] = useState(null);
  const [rpsResult, setRpsResult] = useState("");
  const [reactionScore, setReactionScore] = useState(0);
  const [reactionActive, setReactionActive] = useState(false);
  const [reactionStart, setReactionStart] = useState(0);
  const [paymentBusy, setPaymentBusy] = useState(false);
  const [paymentError, setPaymentError] = useState("");

  const [showReport, setShowReport] = useState(false);
  const [reportBusy, setReportBusy] = useState(false);
  const [showChatMenu, setShowChatMenu] = useState(false);

  const [toast, setToast] = useState("");
  const activeRoomRef = useRef(null);
  const roomsRef = useRef([]);
  const activeMessagesRef = useRef([]);
  const notificationsRef = useRef(notifications);
  const notificationTimerRef = useRef(null);

  const notificationStorageKey = authUser?.id ? "elsewhr-notifications-" + authUser.id : null;

  useEffect(() => {
    if (!notificationStorageKey) {
      setNotifications([]);
      return;
    }
    try {
      const saved = JSON.parse(localStorage.getItem(notificationStorageKey) || "[]");
      setNotifications(Array.isArray(saved) ? saved.slice(0, 40) : []);
    } catch {
      setNotifications([]);
    }
  }, [notificationStorageKey]);

  useEffect(() => {
    notificationsRef.current = notifications;
    if (!notificationStorageKey) return;
    try {
      localStorage.setItem(notificationStorageKey, JSON.stringify(notifications.slice(0, 40)));
    } catch {}
  }, [notifications, notificationStorageKey]);

  const unreadNotifications = notifications.filter(item => !item.read).length;

  function addNotification({ type = "activity", title, body, roomId = null, icon = "bell", action = null, sourceId = null }) {
    const item = {
      id: crypto.randomUUID(),
      sourceId,
      type,
      title: title || "ELSEWHR",
      body: body || "",
      roomId,
      icon,
      action,
      created_at: new Date().toISOString(),
      read: false,
    };
    setNotifications(current => {
      if (sourceId && current.some(existing => existing.sourceId === sourceId)) return current;
      const same = current.some(existing => existing.type === item.type && existing.roomId === item.roomId && existing.body === item.body);
      return same ? current : [item, ...current].slice(0, 40);
    });
    setToast((title ? title + " · " : "") + (body || "New activity"));
    if (notificationTimerRef.current) window.clearTimeout(notificationTimerRef.current);
    notificationTimerRef.current = window.setTimeout(() => setToast(""), 3200);
  }

  function markNotificationsRead() {
    setNotifications(current => current.map(item => ({ ...item, read: true })));
  }

  function clearNotifications() {
    setNotifications([]);
    setNotificationPanel(false);
  }
  const authUserRef = useRef(null);
  const isMatchingRef = useRef(false);
  const matchingSinceRef = useRef(null);
  const isAnonymous = Boolean(authUser?.is_anonymous);
  const profileReady = Boolean(authUser && (isAnonymous || (profile?.primary_photo_path && profile?.age >= 18 && profile?.username)));
  const isPlus = Boolean(profile?.is_plus);
  const visiblePeople = useMemo(() => {
    return discoverPeople.filter(person => {
      if (discoverOnlineOnly && !person.online) return false;
      if (discoverVerifiedOnly && !person.verified_at) return false;
      return true;
    });
  }, [discoverPeople, discoverOnlineOnly, discoverVerifiedOnly]);

  const currentDiscoverPerson = visiblePeople.length
    ? visiblePeople[discoverIndex % visiblePeople.length]
    : null;

  useEffect(() => {
    setDiscoverIndex(0);
  }, [discoverOnlineOnly, discoverVerifiedOnly]);

  useEffect(() => {
    roomsRef.current = rooms;
  }, [rooms]);

  useEffect(() => {
    activeMessagesRef.current = activeMessages;
  }, [activeMessages]);

  const messageRooms = rooms.filter(room => room.kind === "direct");
  const groupRooms = rooms.filter(room => room.kind === "group");
  const activeOther = activeRoom?.members?.find(member => member.user_id !== authUser?.id)?.profile ?? null;
  const activeConnection = activeOther
    ? connections.find(connection => connection.person?.id === activeOther.id)
    : null;

  function goSocial(nextPage) {
    if (!authUser) return;
    if (!isAnonymous && !profileReady && nextPage === "random") {
      setShowProfile(true);
      setToast("Three quick things and you can start Random.");
      return;
    }
    navigateTo(nextPage);
  }

  function navigateTo(nextPage) {
    if (nextPage === page) return;
    const from = PAGE_ORDER.indexOf(page);
    const to = PAGE_ORDER.indexOf(nextPage);
    setPageMotion(to >= from ? "forward" : "back");
    setPage(nextPage);
  }

  function setCurrentRoom(room) {
    activeRoomRef.current = room;
    setActiveRoom(room);
  }

  async function refreshProfile(user) {
    if (!user || !supabase) {
      setProfile(null);
      return null;
    }
    const next = await getProfile(user.id).catch(() => null);
    setProfile(next);
    setProfilePreview(next?.primary_photo_url || "");
    return next;
  }

  async function refreshAll() {
    if (!authUser || !supabase) return;
    setDataError("");
    try {
      const [people, nextConnections, nextRooms] = await Promise.all([
        listDiscoverProfiles(authUser.id),
        listConnections(authUser.id),
        listRooms(authUser.id),
      ]);
      setDiscoverPeople(people);
      setConnections(nextConnections);
      setRooms(nextRooms);

      const liveMatching = isMatchingRef.current;
      const liveMatchingSince = matchingSinceRef.current;
      if (liveMatching && liveMatchingSince) {
        const newMatch = nextRooms.find(room =>
          room.kind === "random" &&
          room.created_at &&
          new Date(room.created_at).getTime() >= liveMatchingSince - 1500
        );
        if (newMatch) {
          const full = await getRoom(newMatch.id);
          setCurrentRoom(full);
          setActiveMessages(await listMessages(full.id, authUser.id));
          setIsMatching(false);
          setMatchingSince(null);
          navigateTo("random");
          setToast("Matched with someone in real time.");
        }
      }
    } catch (error) {
      setDataError(error.message || "Live data could not be loaded.");
    }
  }

  async function refreshMessages(roomId = activeRoomRef.current?.id) {
    if (!roomId) {
      setActiveMessages([]);
      return;
    }
    try {
      const next = await listMessages(roomId, authUser?.id);
      setActiveMessages(next);
    } catch (error) {
      setDataError(error.message || "Messages could not be loaded.");
    }
  }

  async function openRoom(roomOrId, shouldJoin = false, navigateToMessages = false) {
    if (!authUser) return;
    setDataBusy(true);
    setDataError("");
    try {
      let baseRoom = typeof roomOrId === "string"
        ? rooms.find(room => room.id === roomOrId) || null
        : roomOrId;
      if (!baseRoom && typeof roomOrId === "string") {
        baseRoom = await getRoom(roomOrId);
      }
      if (!baseRoom) throw new Error("That room is no longer available.");

      const isMember = baseRoom.members?.some(member => member.user_id === authUser.id && !member.left_at);
      if (!isMember && shouldJoin) {
        await joinRoom(baseRoom.id, authUser.id);
      } else if (!isMember && baseRoom.kind !== "group") {
        throw new Error("You are not a member of this room.");
      }

      const full = await getRoom(baseRoom.id);
      setCurrentRoom(full);
      setActiveMessages(await listMessages(full.id, authUser.id));
      if (navigateToMessages) navigateTo("messages");
    } catch (error) {
      setDataError(error.message || "Room could not be opened.");
    } finally {
      setDataBusy(false);
    }
  }

  async function openConnection(person) {
    if (!person?.id) return;
    if (isAnonymous) {
      setShowProfile(true);
      setToast("Create a permanent account to message people.");
      return;
    }
    if (!profileReady) {
      setShowProfile(true);
      setToast("Add a photo, name and age first. You can skip the extras.");
      return;
    }
    setDataBusy(true);
    try {
      const roomId = await findOrCreateDirectRoom(person.id);
      const full = await getRoom(roomId);
      setCurrentRoom(full);
      setActiveMessages(await listMessages(roomId, authUser.id));
      navigateTo("messages");
    } catch (error) {
      setDataError(error.message || "Conversation could not be opened.");
    } finally {
      setDataBusy(false);
    }
  }

  async function startRandomMatch() {
    if (!authUser || isAnonymous) {
      setShowProfile(true);
      setToast("Create a permanent profile to enter live random chat.");
      return;
    }
    if (!profileReady) {
      setShowProfile(true);
      setToast("Finish your profile and add a primary photo first.");
      return;
    }
    setDataError("");
    const now = Date.now();
    setIsMatching(true);
    setMatchingSince(now);
    isMatchingRef.current = true;
    matchingSinceRef.current = now;
    activeRoomRef.current = null;
    setActiveRoom(null);
    setActiveMessages([]);
    try {
      const roomId = await joinRandomQueue();
      if (roomId) {
        const full = await getRoom(roomId);
        setCurrentRoom(full);
        setActiveMessages(await listMessages(roomId, authUser.id));
        setIsMatching(false);
        setMatchingSince(null);
        isMatchingRef.current = false;
        matchingSinceRef.current = null;
        navigateTo("random");
        setToast("Matched with someone in real time.");
      } else {
        navigateTo("random");
      }
    } catch (error) {
      setIsMatching(false);
      setMatchingSince(null);
      isMatchingRef.current = false;
      matchingSinceRef.current = null;
      setDataError(error.message || "Random matching is unavailable.");
    }
  }

  async function stopRandomMatch() {
    try {
      await leaveRandomQueue();
    } catch {
      // Keep the UI responsive if the queue is already empty.
    }
    setIsMatching(false);
    setMatchingSince(null);
    isMatchingRef.current = false;
    matchingSinceRef.current = null;
  }

  async function handleRandomSkip() {
    const room = activeRoomRef.current || activeRoom;
    if (!authUser) return;

    setDataError("");
    setMessage("");
    setReplyToMessage(null);
    setEditingMessageId(null);
    setOpenMessageActionsId(null);
    setOpenReactionId(null);
    setCurrentRoom(null);
    setActiveMessages([]);

    if (room?.kind === "random") {
      try {
        await leaveRoom(room.id, authUser.id);
      } catch (error) {
        setDataError(error.message || "That chat could not be skipped.");
        return;
      }
    }

    await refreshAll();
    await startRandomMatch();
  }

  function openGame(nextGame) {
    if (nextGame.premium && !isPlus) {
      setShowPlus(true);
      setToast("This game is part of ELSEWHR+.");
      return;
    }
    setGame(nextGame);
    setRpsChoice(null);
    setRpsResult("");
    setReactionScore(0);
    setReactionActive(false);
    setReactionStart(0);
  }

  function playRps(choice) {
    const choices = ["rock", "paper", "scissors"];
    const computer = choices[Math.floor(Math.random() * choices.length)];
    setRpsChoice(choice);
    const result = choice === computer ? "Draw" :
      (choice === "rock" && computer === "scissors") ||
      (choice === "paper" && computer === "rock") ||
      (choice === "scissors" && computer === "paper")
        ? "You win"
        : "ELSEWHR wins";
    setRpsResult(`${result} · ELSEWHR chose ${computer}`);
  }

  function startReactionGame() {
    setReactionScore(0);
    setReactionActive(false);
    const delay = 900 + Math.floor(Math.random() * 2200);
    window.setTimeout(() => {
      setReactionActive(true);
      setReactionStart(performance.now());
    }, delay);
  }

  function hitReaction() {
    if (!reactionActive) return;
    setReactionScore(Math.round(performance.now() - reactionStart));
    setReactionActive(false);
  }

  async function handleAuth(event) {
    event.preventDefault();
    setAuthBusy(true);
    setAccountError("");
    try {
      const result = authMode === "signin"
        ? await signInWithEmail(authEmail, authPassword)
        : await signUpWithEmail(authEmail, authPassword);
      const signedInUser = result.session?.user ?? null;
      setAuthUser(signedInUser);
      if (authMode === "signup" && !signedInUser) {
        setAccountError("Account created. Check your email to confirm your ELSEWHR account, then sign in.");
      }
    } catch (error) {
      setAccountError(error.message || "Authentication failed.");
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleAnonymous() {
    setAuthBusy(true);
    setAccountError("");
    try {
      const result = await signInAnonymously();
      setAuthUser(result.user ?? null);
      setShowProfile(false);
    } catch (error) {
      setAccountError(error.message || "Anonymous access is not enabled.");
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleProfileSave(event) {
    event.preventDefault();
    if (!authUser) return;
    setProfileSaving(true);
    setAccountError("");
    try {
      if (!profileFile && !profile?.primary_photo_path) {
        throw new Error("Add a primary profile photo before joining ELSEWHR.");
      }
      const photo = profileFile ? await uploadAvatar(authUser.id, profileFile) : null;
      const displayName = (document.getElementById("profile-display-name")?.value || "")
        .trim()
        .slice(0, 50);
      if (!displayName) throw new Error("Add your name.");
      const requestedUsername = document.getElementById("profile-username")?.value?.trim() || "";
      const existingUsername = profile?.username || requestedUsername;
      const usernameBase = displayName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 16);
      const username = (existingUsername || (usernameBase || "elsewhr_member") + "_" + authUser.id.replace(/-/g, "").slice(0, 6))
        .slice(0, 24);
      const age = Number(document.getElementById("profile-age")?.value || 0);
      if (age < 18) throw new Error("ELSEWHR is 18+.");
      await saveProfile({
        id: authUser.id,
        username,
        display_name: document.getElementById("profile-display-name")?.value || null,
        age,
        country: document.getElementById("profile-country")?.value || null,
        languages: [document.getElementById("profile-language")?.value || "English"],
        interests: (document.getElementById("profile-interests")?.value || "")
          .split(",").map(value => value.trim()).filter(Boolean).slice(0, 12),
        bio: document.getElementById("profile-bio")?.value || null,
        primary_photo_path: photo?.path || profile?.primary_photo_path || null,
        primary_photo_url: photo?.publicUrl || profile?.primary_photo_url || null,
        discoverable: true,
        online_visible: true,
      });
      await refreshProfile(authUser);
      await refreshAll();
      setShowProfile(false);
      setToast("Profile updated.");
    } catch (error) {
      setAccountError(error.message || "Could not save your profile.");
    } finally {
      setProfileSaving(false);
    }
  }

  async function handleSignOut() {
    try {
      await signOut();
      setAuthUser(null);
      authUserRef.current = null;
      setProfile(null);
      setProfilePreview("");
      setCurrentRoom(null);
      setActiveMessages([]);
      setShowProfile(false);
      setShowAuthForm(false);
      setAccountError("");
    } catch (error) {
      setAccountError(error.message || "Could not sign out.");
    }
  }

  async function handleDeleteAccount() {
    if (!window.confirm("Delete your ELSEWHR account permanently?")) return;
    setDeleteBusy(true);
    setAccountError("");
    try {
      await deleteAccount();
      setAuthUser(null);
      setProfile(null);
      setProfilePreview("");
      setShowProfile(false);
      setCurrentRoom(null);
      setToast("Your account has been deleted.");
    } catch (error) {
      setAccountError(error.message || "Could not delete your account.");
    } finally {
      setDeleteBusy(false);
    }
  }

  async function handleSendMessage(event) {
    event.preventDefault();
    if (!authUser || !activeRoom || (!message.trim() && !attachmentBusy)) return;
    const body = message.trim();
    const currentReply = replyToMessage;
    const currentEditId = editingMessageId;
    setMessage("");
    setReplyToMessage(null);
    setEditingMessageId(null);

    try {
      if (currentEditId) {
        const edited = await editTextMessage(currentEditId, authUser.id, body);
        setActiveMessages(current => current.map(item =>
          item.id === edited.id ? { ...item, ...edited } : item
        ));
      } else {
        await sendTextMessage(activeRoom.id, authUser.id, body, currentReply?.id || null);
      }
      setOpenMessageActionsId(null);
      await refreshMessages(activeRoom.id);
      await refreshAll();
    } catch (error) {
      setMessage(body);
      if (currentReply) setReplyToMessage(currentReply);
      if (currentEditId) setEditingMessageId(currentEditId);
      setDataError(error.message || "Message could not be saved.");
    }
  }

  async function handleSendAttachment(file, caption = "") {
    if (!authUser || !activeRoom || !file) return;
    setAttachmentBusy(true);
    try {
      await uploadRoomAttachment(activeRoom.id, authUser.id, file, caption, replyToMessage?.id || null);
      setMessage("");
      setReplyToMessage(null);
      setOpenMessageActionsId(null);
      setOpenReactionId(null);
      await refreshMessages(activeRoom.id);
      await refreshAll();
      setToast(file.type?.startsWith("image/") ? "Picture sent." : "Attachment sent.");
    } catch (error) {
      setDataError(error.message || "Attachment could not be sent.");
    } finally {
      setAttachmentBusy(false);
    }
  }

  function startReply(messageToReply) {
    setReplyToMessage(messageToReply);
    setEditingMessageId(null);
    setOpenMessageActionsId(null);
    setOpenReactionId(null);
  }

  function startEdit(messageToEdit) {
    if (messageToEdit.sender_id !== authUser?.id || messageToEdit.deleted_at || !messageToEdit.body) return;
    setEditingMessageId(messageToEdit.id);
    setReplyToMessage(null);
    setMessage(messageToEdit.body);
    setOpenMessageActionsId(null);
    setOpenReactionId(null);
  }

  function cancelMessageEdit() {
    setEditingMessageId(null);
    setMessage("");
  }

  async function handleDeleteForMe(messageToDelete) {
    if (!authUser) return;
    try {
      await deleteMessageForMe(messageToDelete.id, authUser.id);
      setOpenMessageActionsId(null);
      await refreshMessages(activeRoom?.id);
      await refreshAll();
    } catch (error) {
      setDataError(error.message || "Message could not be removed for you.");
    }
  }

  async function handleDeleteForEveryone(messageToDelete) {
    if (!authUser || messageToDelete.sender_id !== authUser.id) return;
    if (!window.confirm("Delete this message for everyone?")) return;
    try {
      await deleteMessageForEveryone(messageToDelete.id, authUser.id);
      setOpenMessageActionsId(null);
      await refreshMessages(activeRoom?.id);
      await refreshAll();
    } catch (error) {
      setDataError(error.message || "Message could not be deleted for everyone.");
    }
  }

  async function handleMessageReaction(messageToReact, reaction) {
    if (!authUser) return;
    try {
      await toggleMessageReaction(messageToReact.id, authUser.id, reaction);
      setOpenReactionId(null);
      setOpenMessageActionsId(null);
      await refreshMessages(activeRoom?.id);
    } catch (error) {
      setDataError(error.message || "Reaction could not be changed.");
    }
  }

  async function handleCopyMessage(messageToCopy) {
    if (!messageToCopy.body) return;
    try {
      await navigator.clipboard.writeText(messageToCopy.body);
      setToast("Message copied.");
    } catch {
      setDataError("Your browser did not allow clipboard access.");
    }
    setOpenMessageActionsId(null);
  }

  async function handleConnect(person) {
    if (!authUser || !person?.id) return;
    if (isAnonymous) {
      setShowProfile(true);
      setToast("Create a permanent account to connect with people.");
      return;
    }
    if (!profileReady) {
      setShowProfile(true);
      setToast("Add a photo, name and age first. You can skip the extras.");
      return;
    }
    try {
      const result = await connectToUser(authUser.id, person.id);
      await refreshAll();
      if (result?.status === "accepted" && result?.room_id) {
        const full = await getRoom(result.room_id);
        setCurrentRoom(full);
        setActiveMessages(await listMessages(full.id, authUser.id));
        setToast("You are connected. This Random conversation is now saved.");
      } else {
        setToast("Connection request sent.");
      }
    } catch (error) {
      setDataError(error.message || "Connection request failed.");
    }
  }

  async function handleConnectionStatus(connectionId, status) {
    try {
      const result = await updateConnection(connectionId, status);
      await refreshAll();
      if (status === "accepted" && result?.room_id) {
        const full = await getRoom(result.room_id);
        setCurrentRoom(full);
        setActiveMessages(await listMessages(full.id, authUser.id));
        setToast("Connection accepted. Your Random conversation is saved in Messages.");
      }
    } catch (error) {
      setDataError(error.message || "Connection could not be updated.");
    }
  }

  async function handleCreateRoom(event) {
    event.preventDefault();
    if (!authUser || !roomTitle.trim()) return;
    setRoomBusy(true);
    try {
      const room = await createGroupRoom(authUser.id, roomTitle, roomDescription);
      setRoomTitle("");
      setRoomDescription("");
      await refreshAll();
      setToast("Room created. Find it in Rooms to open it.");
    } catch (error) {
      setDataError(error.message || "Room could not be created.");
    } finally {
      setRoomBusy(false);
    }
  }

  async function handleJoinRoom(room) {
    if (!authUser || !room?.id) return;
    setDataBusy(true);
    setDataError("");
    try {
      await joinRoom(room.id, authUser.id);
      await openRoom(room.id);
      await refreshAll();
      navigateTo("rooms");
      setToast("You're in. Welcome to the room.");
    } catch (error) {
      setDataError(error.message || "Room could not be entered.");
    } finally {
      setDataBusy(false);
    }
  }

  async function handleLeaveRoom() {
    if (!activeRoom || !authUser) return;
    const leavingKind = activeRoom.kind;
    try {
      await leaveRoom(activeRoom.id, authUser.id);
      setCurrentRoom(null);
      setActiveMessages([]);
      await refreshAll();
      if (leavingKind === "group") navigateTo("rooms");
      else if (page !== "messages" && page !== "random") navigateTo("home");
      setToast("You left the room.");
    } catch (error) {
      setDataError(error.message || "Could not leave this room.");
    }
  }

  async function handleReport(reason) {
    if (!authUser || !activeOther) return;
    setReportBusy(true);
    try {
      await reportUser(authUser.id, activeOther.id, activeRoom?.id, reason);
      setShowReport(false);
      setToast("Report submitted.");
    } catch (error) {
      setDataError(error.message || "Report could not be submitted.");
    } finally {
      setReportBusy(false);
    }
  }

  async function handleBlock() {
    if (!authUser || !activeOther) return;
    try {
      await blockUser(authUser.id, activeOther.id);
      setShowChatMenu(false);
      await handleLeaveRoom();
      await refreshAll();
      setToast("Member blocked.");
    } catch (error) {
      setDataError(error.message || "Block could not be applied.");
    }
  }

  async function handlePlusCheckout(plan) {
    if (!authUser) {
      setShowProfile(true);
      return;
    }
    if (isAnonymous) {
      setShowProfile(true);
      setToast("Create a permanent account before getting ELSEWHR+.");
      return;
    }
    setPaymentBusy(true);
    setPaymentError("");
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Your session expired. Sign in again.");
      const approvalUrl = await startPaypalSubscription(plan, token);
      window.location.href = approvalUrl;
    } catch (error) {
      setPaymentError(error.message || "PayPal checkout could not start.");
    } finally {
      setPaymentBusy(false);
    }
  }

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("elsewhr-theme", theme);
    } catch {
      // Keep the theme working even when storage is unavailable.
    }
  }, [theme]);

  useEffect(() => {
    const timer = window.setTimeout(() => setShowWelcome(false), 2300);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!supabase) {
      setAuthChecked(true);
      return;
    }

    let mounted = true;
    getCurrentUser()
      .then(async user => {
        if (!mounted) return;
        setAuthUser(user);
        authUserRef.current = user;
        if (user) await refreshProfile(user);
      })
      .catch(() => {
        if (!mounted) return;
        setAuthUser(null);
        authUserRef.current = null;
      })
      .finally(() => {
        if (mounted) setAuthChecked(true);
      });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user ?? null;
      setAuthUser(user);
      authUserRef.current = user;
      if (user) refreshProfile(user);
      else setProfile(null);
    });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!authUser || !supabase) return;

    let disposed = false;
    const load = async () => {
      if (!disposed) {
        await touchPresence(true).catch(() => {});
        await refreshAll();
      }
    };
    load();

    const heartbeat = window.setInterval(() => {
      touchPresence(true).catch(() => {});
    }, 20000);

    const channel = supabase
      .channel("elsewhr-live-" + authUser.id)
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, async () => {
        await refreshAll();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "presence" }, async () => {
        await refreshAll();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "connections" }, async (payload) => {
        if (!disposed && payload?.new) {
          const row = payload.new;
          const isIncoming = row.receiver_id === authUser.id;
          const isOutgoing = row.requester_id === authUser.id;
          if (isIncoming && row.status === "pending") {
            addNotification({
              type: "connection",
              title: "New connection request",
              body: "Someone wants to connect with you.",
              icon: "heart",
              sourceId: "connection-request-" + row.id + "-" + row.updated_at,
            });
          } else if ((isIncoming || isOutgoing) && row.status === "accepted") {
            addNotification({
              type: "connection",
              title: "Connection accepted",
              body: "Your connection is now active.",
              icon: "heart",
              sourceId: "connection-accepted-" + row.id + "-" + row.updated_at,
            });
          }
        }
        await refreshAll();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "rooms" }, async (payload) => {
        if (!disposed && payload?.eventType === "INSERT" && payload.new?.created_by !== authUser.id) {
          addNotification({
            type: "room",
            title: "New room opened",
            body: payload.new?.title || "A new public room is live.",
            roomId: payload.new?.id || null,
            icon: "panels-top-left",
            sourceId: "room-created-" + payload.new?.id,
          });
        }
        await refreshAll();
        if (activeRoomRef.current?.id) {
          try {
            const freshRoom = await getRoom(activeRoomRef.current.id);
            setCurrentRoom(freshRoom);
          } catch {}
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "room_members" }, async (payload) => {
        if (!disposed && payload?.eventType === "INSERT" && payload.new?.user_id !== authUser.id) {
          const room = roomsRef.current.find(item => item.id === payload.new.room_id);
          const joinedByMe = room?.members?.some(member => member.user_id === authUser.id && !member.left_at);
          if (joinedByMe) {
            addNotification({
              type: "room",
              title: "Someone joined a room",
              body: (room?.title || "A room") + " has a new member.",
              roomId: room.id,
              icon: "users-round",
              sourceId: "room-member-" + payload.new.room_id + "-" + payload.new.user_id + "-" + payload.new.joined_at,
            });
          }
        }
        await refreshAll();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, async (payload) => {
        const incoming = payload?.eventType === "INSERT" ? payload.new : null;
        if (!disposed && incoming?.sender_id && incoming.sender_id !== authUser.id) {
          addNotification({
            type: "message",
            title: incoming.media_path ? "New attachment" : "New message",
            body: incoming.media_path
              ? (incoming.media_type?.startsWith("image/") ? "Someone sent you a picture." : "Someone sent you an attachment.")
              : (incoming.body || "Someone sent you a message."),
            roomId: incoming.room_id,
            icon: incoming.media_path ? "paperclip" : "message-circle",
            sourceId: "message-" + incoming.id,
          });
        } else if (!disposed && payload?.eventType === "UPDATE" && payload.new?.deleted_at && payload.old?.deleted_at !== payload.new.deleted_at) {
          addNotification({
            type: "message",
            title: "Message deleted",
            body: "A message was removed from a conversation.",
            roomId: payload.new?.room_id || null,
            icon: "trash-2",
            sourceId: "message-delete-" + payload.new?.id,
          });
        }
        await refreshAll();
        if (activeRoomRef.current?.id) await refreshMessages(activeRoomRef.current.id);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "message_reactions" }, async (payload) => {
        if (!disposed && payload?.eventType === "INSERT" && payload.new?.user_id !== authUser.id) {
          const messageId = payload.new.message_id;
          const known = activeMessagesRef.current.find(message => message.id === messageId);
          let roomId = known?.room_id || null;
          let mine = known?.sender_id === authUser.id;
          if (!known && messageId) {
            const { data: target } = await supabase.from("messages").select("room_id, sender_id").eq("id", messageId).maybeSingle();
            roomId = target?.room_id || null;
            mine = target?.sender_id === authUser.id;
          }
          if (mine) {
            addNotification({
              type: "reaction",
              title: "New reaction",
              body: payload.new?.reaction ? payload.new.reaction + " on your message." : "Someone reacted to your message.",
              roomId,
              icon: "smile-plus",
              sourceId: "reaction-" + payload.new.message_id + "-" + payload.new.user_id + "-" + payload.new.reaction,
            });
          }
        }
        if (activeRoomRef.current?.id) await refreshMessages(activeRoomRef.current.id);
        await refreshAll();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "message_deletions" }, async () => {
        if (activeRoomRef.current?.id) await refreshMessages(activeRoomRef.current.id);
        await refreshAll();
      })
      .subscribe();

    const sitePresence = supabase.channel("elsewhr-site-presence", {
      config: { presence: { key: authUser.id } },
    });

    const updateSitePresenceCount = () => {
      const state = sitePresence.presenceState();
      setSiteOnlineCount(Object.keys(state).length);
    };

    sitePresence
      .on("presence", { event: "sync" }, updateSitePresenceCount)
      .on("presence", { event: "join" }, updateSitePresenceCount)
      .on("presence", { event: "leave" }, updateSitePresenceCount)
      .subscribe(async status => {
        if (status !== "SUBSCRIBED") return;
        try {
          await sitePresence.track({
            user_id: authUser.id,
            online_at: new Date().toISOString(),
          });
          updateSitePresenceCount();
        } catch {
          setSiteOnlineCount(current => current || 1);
        }
      });

    const markOffline = () => {
      touchPresence(false).catch(() => {});
    };
    window.addEventListener("beforeunload", markOffline);

    return () => {
      disposed = true;
      window.clearInterval(heartbeat);
      window.removeEventListener("beforeunload", markOffline);
      supabase.removeChannel(channel);
      sitePresence.untrack().catch(() => {});
      supabase.removeChannel(sitePresence);
      setSiteOnlineCount(0);
      touchPresence(false).catch(() => {});
    };
  }, [authUser?.id]);

  useEffect(() => {
    activeRoomRef.current = activeRoom;
  }, [activeRoom]);

  useEffect(() => {
    setOpenMessageActionsId(null);
    setOpenReactionId(null);
    setReplyToMessage(null);
    setEditingMessageId(null);
    setMessage("");
    setShowChatMenu(false);

    if (!activeRoom?.id) {
      setActiveMessages([]);
      return;
    }
    refreshMessages(activeRoom.id);
  }, [activeRoom?.id]);

  if (showWelcome) {
    return (
      <div className="welcome-screen">
        <div className="welcome-bubble">
          <span className="welcome-dot dot-a" />
          <span className="welcome-dot dot-b" />
          <span className="welcome-dot dot-c" />
          <div className="welcome-logo"><BrandMark size={58} /></div>
        </div>
        <div className="welcome-wordmark">ELSEWHR</div>
        <div className="welcome-tag">GO SOMEWHERE ELSE.</div>
      </div>
    );
  }

  if (!authChecked) {
    return (
      <div className="auth-gate">
        <div className="auth-gate-inner">
          <div className="auth-gate-logo"><BrandMark size={34} /><strong>ELSEWHR</strong></div>
          <span className="eyebrow">ELSEWHR</span>
          <h1>Connecting.</h1>
          <p>Checking your live session.</p>
        </div>
      </div>
    );
  }

  if (!authUser) {
    return (
      <div className="auth-gate">
        <div className="auth-gate-inner">
          <div className="auth-gate-logo"><BrandMark size={34} /><strong>ELSEWHR</strong></div>
          {!showAuthForm ? (
            <>
              <span className="eyebrow">GO SOMEWHERE ELSE</span>
              <h1>Get in.<br /><span>Find someone.</span></h1>
              <p>No profile essay. No maze. Get inside first and figure the rest out later.</p>
              {supabaseConfigured ? (
                <div className="auth-quick-start">
                  <button className="auth-quick-primary" onClick={handleAnonymous} disabled={authBusy}>
                    <span><Icon name="zap" size={16} /> ENTER ELSEWHR</span>
                    <small>Start anonymously</small>
                  </button>
                  <div className="auth-quick-secondary">
                    <button onClick={() => { setAuthMode("signup"); setShowAuthForm(true); setAccountError(""); }}>CREATE ACCOUNT</button>
                    <button onClick={() => { setAuthMode("signin"); setShowAuthForm(true); setAccountError(""); }}>SIGN IN</button>
                  </div>
                  <small className="auth-footnote">You can create a permanent profile later.</small>
                </div>
              ) : (
                <div className="form-error">Supabase is not configured for this deployment.</div>
              )}
            </>
          ) : (
            <>
              <button className="auth-back" onClick={() => { setShowAuthForm(false); setAccountError(""); }}><Icon name="arrow-left" size={14} /> BACK</button>
              <span className="eyebrow">{authMode === "signup" ? "CREATE ACCOUNT" : "WELCOME BACK"}</span>
              <h1>{authMode === "signup" ? "You're almost in." : "Welcome back."}</h1>
              <p>{authMode === "signup" ? "Email and password. That's it." : "Pick up where you left off."}</p>
              {supabaseConfigured && (
                <form onSubmit={handleAuth} className="auth-form auth-gate-form">
                  <div className="auth-toggle">
                    <button type="button" className={authMode === "signin" ? "selected" : ""} onClick={() => { setAuthMode("signin"); setAccountError(""); }}>Sign in</button>
                    <button type="button" className={authMode === "signup" ? "selected" : ""} onClick={() => { setAuthMode("signup"); setAccountError(""); }}>Sign up</button>
                  </div>
                  <label>Email<input type="email" required value={authEmail} onChange={e => setAuthEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" /></label>
                  <label>Password<input type="password" minLength={8} required value={authPassword} onChange={e => setAuthPassword(e.target.value)} placeholder="At least 8 characters" autoComplete={authMode === "signup" ? "new-password" : "current-password"} /></label>
                  {accountError && <div className="form-error">{accountError}</div>}
                  <button className="primary full" disabled={authBusy}>{authBusy ? "WORKING..." : authMode === "signin" ? "SIGN IN" : "CREATE ACCOUNT"}</button>
                  <button type="button" className="secondary full anonymous-entry" onClick={handleAnonymous} disabled={authBusy}><Icon name="ghost" size={15} /> JUST LET ME IN</button>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  const nav = [
    ["home", "house", "Home"],
    ["random", "zap", "Random"],
    ["discover", "compass", "Discover"],
    ["connections", "heart", "Connections"],
    ["messages", "message-circle", "Messages"],
    ["rooms", "panels-top-left", "Rooms"],
    ["games", "gamepad-2", "Games"],
  ];

  return (
    <>
      <div className="app-shell">
        <aside className="sidebar">
          <button className="brand" onClick={() => navigateTo("home")}>
            <BrandMark /><span>ELSEWHR</span>
          </button>

          <div className="side-section">
            <span className="side-label">EXPLORE</span>
            {nav.map(([key, icon, label]) => (
              <button key={key} className={"nav-item " + (page === key ? "active" : "")} onClick={() => key === "home" ? navigateTo("home") : goSocial(key)}>
                <span className="nav-icon"><Icon name={icon} /></span><span>{label}</span>
              </button>
            ))}
          </div>

          <div className="sidebar-bottom">
            <button className="nav-item" onClick={() => setShowProfile(true)}><span className="nav-icon"><Icon name="user-circle-2" /></span><span>My Profile</span></button>
            <button className="nav-item" onClick={() => setShowPlus(true)}><span className="nav-icon"><Icon name="sparkles" /></span><span>ELSEWHR+</span></button>
          </div>
        </aside>

        <main className="main">
          <header className="topbar">
            <div className="mobile-brand">ELSEWHR</div>
            <div className="online-pill"><span className="status-dot" /> {siteOnlineCount} people online</div>
            <div className="top-actions">
              <button className="theme-toggle" onClick={() => setTheme(value => value === "dark" ? "light" : "dark")} aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"} title={theme === "dark" ? "Light mode" : "Dark mode"}>
                <Icon name={theme === "dark" ? "sun-medium" : "moon"} size={15} />
                <span>{theme === "dark" ? "LIGHT" : "DARK"}</span>
              </button>
              <button className={"notification-button " + (notificationPanel ? "active" : "")} onClick={() => { setNotificationPanel(value => !value); markNotificationsRead(); }} aria-label="Notifications" title="Notifications">
                <Icon name={unreadNotifications ? "bell-ring" : "bell"} size={16} />
                <span>{unreadNotifications > 99 ? "99+" : unreadNotifications}</span>
              </button>
              <button className="plus-open-button" onClick={() => setShowPlus(true)}><Icon name="sparkles" size={14} /> Get Plus</button>
              <button className="avatar-button" onClick={() => setShowProfile(true)}>{initials(profile || { username: isAnonymous ? "guest" : authUser.email })}</button>
            </div>
          </header>

          {dataError && (
            <div className="live-error">
              <Icon name="circle-alert" size={14} /> {dataError}
            </div>
          )}
          {notificationPanel && (
            <NotificationPanel
              notifications={notifications}
              onClose={() => setNotificationPanel(false)}
              onClear={clearNotifications}
              onOpenRoom={async roomId => {
                setNotificationPanel(false);
                await openRoom(roomId);
                navigateTo(roomId && rooms.some(room => room.id === roomId && room.kind === "group") ? "rooms" : "messages");
              }}
            />
          )}

          <div className={"content page-transition " + pageMotion} key={page}>
            {page === "home" && (
              <section className="hero-page">
                <div className="eyebrow">LIVE ELSEWHERE</div>
                <h1>Someone,<br /><span>somewhere,</span><br />is waiting.</h1>
                <p>Meet real people outside your usual world. Every profile, room, connection, and conversation on this surface comes from ELSEWHR live data.</p>
                <div className="hero-actions">
                  <button className="primary large" onClick={startRandomMatch}>GO ELSEWHR <Icon name="arrow-up-right" size={16} /></button>
                  <button className="secondary large" onClick={() => goSocial("discover")}>DISCOVER PEOPLE</button>
                </div>
                <div className="hero-grid">
                  <div><strong>{discoverPeople.length}</strong><span>discoverable members</span></div>
                  <div><strong>{siteOnlineCount}</strong><span>on ELSEWHR now</span></div>
                  <div><strong>{messageRooms.length}</strong><span>your live conversations</span></div>
                </div>
              </section>
            )}

            {page === "random" && (
              <section className="chat-page">
                {isMatching ? (
                  <div className="matching-stage">
                    <div className="matching-orbit"><span /><i /><b /></div>
                    <span className="eyebrow">LIVE MATCHMAKING</span>
                    <h2>Looking for someone.</h2>
                    <p>Your queue is live. A room appears here the moment another eligible member matches with you.</p>
                    <button className="secondary" onClick={stopRandomMatch}>LEAVE QUEUE</button>
                  </div>
                ) : activeRoom ? (
                  <LiveChat
                    activeRoom={activeRoom}
                    activeOther={activeOther}
                    activeConnection={activeConnection}
                    isPlus={isPlus}
                    onShowPlus={() => setShowPlus(true)}
                    activeMessages={activeMessages}
                    authUser={authUser}
                    message={message}
                    setMessage={setMessage}
                    editingMessageId={editingMessageId}
                    replyToMessage={replyToMessage}
                    openMessageActionsId={openMessageActionsId}
                    openReactionId={openReactionId}
                    onConnect={handleConnect}
                    onSend={handleSendMessage}
                    onSendAttachment={handleSendAttachment}
                    attachmentBusy={attachmentBusy}
                    onNotify={addNotification}
                    onStartReply={startReply}
                    onStartEdit={startEdit}
                    onCancelEdit={cancelMessageEdit}
                    onDeleteForMe={handleDeleteForMe}
                    onDeleteForEveryone={handleDeleteForEveryone}
                    onReact={handleMessageReaction}
                    onCopy={handleCopyMessage}
                    onToggleMessageActions={id => {
                      setOpenMessageActionsId(current => current === id ? null : id);
                      setOpenReactionId(null);
                    }}
                    onToggleReactionPicker={id => {
                      setOpenReactionId(current => current === id ? null : id);
                      setOpenMessageActionsId(null);
                    }}
                    onReport={() => setShowReport(true)}
                    onMenu={() => setShowChatMenu(value => !value)}
                    onSkip={handleRandomSkip}
                    onLeave={handleLeaveRoom}
                  />
                ) : (
                  <div className="empty-state full-state">
                    <div className="empty-icon"><Icon name="radio" size={23} /></div>
                    <span className="eyebrow">RANDOM CHAT</span>
                    <h2>No active match.</h2>
                    <p>Start a live match and ELSEWHR will create a real room when another eligible member is available.</p>
                    <button className="primary" onClick={startRandomMatch}>START RANDOM CHAT</button>
                  </div>
                )}
              </section>
            )}

            {page === "discover" && (
              <section className="discover-page">
                <div className="section-heading">
                  <div><span className="eyebrow">DISCOVER</span><h2>Real people, right now.</h2></div>
                  <div className="filter-row">
                    <label><input type="checkbox" checked={discoverOnlineOnly} onChange={e => setDiscoverOnlineOnly(e.target.checked)} /> Online</label>
                    <label><input type="checkbox" checked={discoverVerifiedOnly} onChange={e => setDiscoverVerifiedOnly(e.target.checked)} /> Verified</label>
                  </div>
                </div>

                {currentDiscoverPerson ? (
                  <div className="discover-layout">
                    <div className="profile-card">
                      <button
                        type="button"
                        className="profile-photo real-photo discover-profile-trigger"
                        onClick={() => setViewedProfile(currentDiscoverPerson)}
                        aria-label={"View " + personName(currentDiscoverPerson) + "'s profile"}
                        style={currentDiscoverPerson.primary_photo_url ? { backgroundImage: "url(" + currentDiscoverPerson.primary_photo_url + ")" } : undefined}
                      >
                        {!currentDiscoverPerson.primary_photo_url && <div className="photo-fallback">{initials(currentDiscoverPerson)}</div>}
                        {currentDiscoverPerson.verified_at && <div className="verified-placeholder"><Icon name="badge-check" size={17} /></div>}
                        <span className="live-photo-meta">
                          <strong>{personName(currentDiscoverPerson)}</strong>
                          <span><i className={currentDiscoverPerson.online ? "online-dot" : "offline-dot"} /> {currentDiscoverPerson.online ? "Online now" : "Offline"}</span>
                        </span>
                      </button>
                      <div className="profile-info">
                        <button type="button" className="discover-name-button" onClick={() => setViewedProfile(currentDiscoverPerson)}>
                          <div className="name-line">
                            <h3>{personName(currentDiscoverPerson)}{currentDiscoverPerson.age ? ", " + currentDiscoverPerson.age : ""}</h3>
                          </div>
                        </button>
                        <span className="country-line">{currentDiscoverPerson.country || "Location not shared"}</span>
                        {currentDiscoverPerson.bio && <p>{currentDiscoverPerson.bio}</p>}
                        <div className="tags">
                          {(currentDiscoverPerson.interests || []).slice(0, 8).map(tag => <span key={tag}>{tag}</span>)}
                        </div>
                        <div className="swipe-actions">
                          <button className="round-button pass" onClick={() => setDiscoverIndex(value => value + 1)} aria-label="Next profile"><Icon name="x" size={22} /></button>
                          <button className="round-button connect" onClick={() => handleConnect(currentDiscoverPerson)} aria-label="Connect"><Icon name="heart" size={21} /></button>
                          <button className="round-button super" onClick={() => openConnection(currentDiscoverPerson)} aria-label="Message"><Icon name="message-circle" size={20} /></button>
                        </div>
                      </div>
                    </div>
                    <div className="discover-side">
                      <div className="quote-card">
                        <span>LIVE PROFILE</span>
                        <strong>{currentDiscoverPerson.online ? "Available right now." : "Recently active."}</strong>
                        <small>Last profile update {timeLabel(currentDiscoverPerson.updated_at)}</small>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="empty-state">
                    <div className="empty-icon"><Icon name="users-round" size={23} /></div>
                    <span className="eyebrow">DISCOVER</span>
                    <h2>No discoverable members yet.</h2>
                    <p>There are no real profiles matching your filters right now.</p>
                  </div>
                )}
              </section>
            )}

            {page === "connections" && (
              <section className="simple-page">
                <span className="eyebrow">CONNECTIONS</span>
                <h2>Your real connections.</h2>
                {connections.length ? (
                  <div className="connection-grid">
                    {connections.map(connection => (
                      <article className="connection-card" key={connection.id}>
                        <div className="conn-avatar real-small-avatar" style={connection.person.primary_photo_url ? { backgroundImage: "url(" + connection.person.primary_photo_url + ")" } : undefined}>
                          {!connection.person.primary_photo_url && initials(connection.person)}
                        </div>
                        <div className="connection-main">
                          <h3>{personName(connection.person)}</h3>
                          <span>{connection.person.country || "Location not shared"} · {connection.status}</span>
                        </div>
                        <div className="connection-actions">
                          {connection.status === "pending" && connection.direction === "incoming" && (
                            <>
                              <button onClick={() => handleConnectionStatus(connection.id, "accepted")}>ACCEPT</button>
                              <button className="secondary-mini" onClick={() => handleConnectionStatus(connection.id, "rejected")}>DECLINE</button>
                            </>
                          )}
                          {connection.status === "accepted" && <button onClick={() => openConnection(connection.person)}>CHAT</button>}
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state">
                    <div className="empty-icon"><Icon name="heart" size={23} /></div>
                    <span className="eyebrow">CONNECTIONS</span>
                    <h2>No connections yet.</h2>
                    <p>Connect with a real profile in Discover and your connections will appear here.</p>
                    <button className="primary" onClick={() => navigateTo("discover")}>OPEN DISCOVER</button>
                  </div>
                )}
              </section>
            )}

            {page === "messages" && (
              <section className="messages-page">
                <div className="section-heading">
                  <div>
                    <span className="eyebrow">MESSAGES</span>
                    <h2>Your conversations.</h2>
                  </div>
                  <span className="messages-count">{messageRooms.length} saved</span>
                </div>

                {messageRooms.length ? (
                  <div className={"messages-layout " + (activeRoom ? "has-active-chat" : "")}>
                    <aside className="conversation-sidebar">
                      <div className="conversation-sidebar-head">
                        <span className="eyebrow">PEOPLE YOU TALKED TO</span>
                        <small>{messageRooms.length}</small>
                      </div>
                      <div className="conversation-list">
                        {messageRooms.map(room => {
                          const other = room.members?.find(member => member.user_id !== authUser.id)?.profile;
                          const selected = activeRoom?.id === room.id;
                          const last = room.latest_message;
                          return (
                            <button className={"conversation-item " + (selected ? "selected" : "")} key={room.id} onClick={() => openRoom(room.id)}>
                              <div className="conn-avatar real-small-avatar" style={other?.primary_photo_url ? { backgroundImage: "url(" + other.primary_photo_url + ")" } : undefined}>
                                {!other?.primary_photo_url && initials(other || { username: room.kind })}
                              </div>
                              <div className="conversation-copy">
                                <strong>{room.kind === "random" ? personName(other) : room.title || personName(other)}</strong>
                                <span>{last?.body || "No messages yet."}</span>
                              </div>
                              <small>{timeLabel(last?.created_at || room.created_at)}</small>
                            </button>
                          );
                        })}
                      </div>
                    </aside>

                    <div className="conversation-stage">
                      {activeRoom ? (
                        <>
                          <button className="conversation-mobile-back" type="button" onClick={() => {
                            setCurrentRoom(null);
                            setActiveMessages([]);
                          }}>
                            <Icon name="arrow-left" size={14} /> All conversations
                          </button>
                          <LiveChat
                            activeRoom={activeRoom}
                            activeOther={activeOther}
                            activeConnection={activeConnection}
                            activeMessages={activeMessages}
                            authUser={authUser}
                            message={message}
                            setMessage={setMessage}
                            editingMessageId={editingMessageId}
                            replyToMessage={replyToMessage}
                            openMessageActionsId={openMessageActionsId}
                            openReactionId={openReactionId}
                            onConnect={handleConnect}
                            onSend={handleSendMessage}
                            onSendAttachment={handleSendAttachment}
                            attachmentBusy={attachmentBusy}
                            onNotify={addNotification}
                            onStartReply={startReply}
                            onStartEdit={startEdit}
                            onCancelEdit={cancelMessageEdit}
                            onDeleteForMe={handleDeleteForMe}
                            onDeleteForEveryone={handleDeleteForEveryone}
                            onReact={handleMessageReaction}
                            onCopy={handleCopyMessage}
                            onToggleMessageActions={id => {
                              setOpenMessageActionsId(current => current === id ? null : id);
                              setOpenReactionId(null);
                            }}
                            onToggleReactionPicker={id => {
                              setOpenReactionId(current => current === id ? null : id);
                              setOpenMessageActionsId(null);
                            }}
                            onReport={() => setShowReport(true)}
                            onMenu={() => setShowChatMenu(value => !value)}
                            onLeave={handleLeaveRoom}
                          />
                        </>
                      ) : (
                        <div className="conversation-placeholder">
                          <div className="empty-icon"><Icon name="message-square-more" size={22} /></div>
                          <span className="eyebrow">SELECT A CONVERSATION</span>
                          <h3>Choose someone.</h3>
                          <p>Your conversations stay here. Selecting one opens the chat without leaving Messages.</p>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="empty-state">
                    <div className="empty-icon"><Icon name="message-circle" size={23} /></div>
                    <span className="eyebrow">MESSAGES</span>
                    <h2>No conversations yet.</h2>
                    <p>People you talk to will appear here. Random conversations become saved chats when you connect.</p>
                    <button className="primary" onClick={() => navigateTo("discover")}>DISCOVER PEOPLE</button>
                  </div>
                )}
              </section>
            )}

            {page === "games" && (
              <GamesPage
                isPlus={isPlus}
                game={game}
                setGame={setGame}
                rpsChoice={rpsChoice}
                rpsResult={rpsResult}
                onRps={playRps}
                reactionScore={reactionScore}
                reactionActive={reactionActive}
                onStartReaction={startReactionGame}
                onHitReaction={hitReaction}
                onOpenGame={openGame}
                onShowPlus={() => setShowPlus(true)}
              />
            )}

            {page === "rooms" && (
              activeRoom?.kind === "group" ? (
                <div className="room-chat-surface">
                  <button
                    className="conversation-mobile-back room-back-button"
                    type="button"
                    onClick={() => { setCurrentRoom(null); setActiveMessages([]); }}
                  >
                    <Icon name="arrow-left" size={14} /> All rooms
                  </button>
                  <LiveChat
                    activeRoom={activeRoom}
                    activeOther={activeOther}
                    activeConnection={activeConnection}
                    isPlus={isPlus}
                    onShowPlus={() => setShowPlus(true)}
                    activeMessages={activeMessages}
                    authUser={authUser}
                    message={message}
                    setMessage={setMessage}
                    editingMessageId={editingMessageId}
                    replyToMessage={replyToMessage}
                    openMessageActionsId={openMessageActionsId}
                    openReactionId={openReactionId}
                    onConnect={handleConnect}
                    onSend={handleSendMessage}
                    onSendAttachment={handleSendAttachment}
                    attachmentBusy={attachmentBusy}
                    onNotify={addNotification}
                    onStartReply={startReply}
                    onStartEdit={startEdit}
                    onCancelEdit={cancelMessageEdit}
                    onDeleteForMe={handleDeleteForMe}
                    onDeleteForEveryone={handleDeleteForEveryone}
                    onReact={handleMessageReaction}
                    onCopy={handleCopyMessage}
                    onToggleMessageActions={id => {
                      setOpenMessageActionsId(current => current === id ? null : id);
                      setOpenReactionId(null);
                    }}
                    onToggleReactionPicker={id => {
                      setOpenReactionId(current => current === id ? null : id);
                      setOpenMessageActionsId(null);
                    }}
                    onReport={() => setShowReport(true)}
                    onMenu={() => setShowChatMenu(value => !value)}
                    onLeave={handleLeaveRoom}
                  />
                </div>
              ) : (
                <section className="simple-page">
                  <div className="section-heading">
                    <div><span className="eyebrow">ROOMS</span><h2>Live public rooms.</h2></div>
                  </div>
                  <form className="room-create-card" onSubmit={handleCreateRoom}>
                    <div>
                      <strong>Create a public room</strong>
                      <span>Give people a real place to talk.</span>
                    </div>
                    <input value={roomTitle} onChange={e => setRoomTitle(e.target.value)} required maxLength={80} placeholder="Room name" />
                    <input value={roomDescription} onChange={e => setRoomDescription(e.target.value)} maxLength={180} placeholder="What is this room about?" />
                    <button className="primary" disabled={roomBusy}>{roomBusy ? "CREATING..." : "CREATE ROOM"}</button>
                  </form>
                  {groupRooms.length ? (
                    <div className="room-grid">
                      {groupRooms.map(room => {
                        const joined = room.members?.some(member => member.user_id === authUser.id && !member.left_at);
                        return (
                          <article className="room-card" key={room.id}>
                            <div className="room-card-top"><span className="eyebrow">PUBLIC ROOM</span><span>{joined ? (room.members?.length || 1) + " live" : "OPEN"}</span></div>
                            <h3>{room.title || "Untitled room"}</h3>
                            <p>{room.description || "No description."}</p>
                            <button
                              className="secondary"
                              disabled={dataBusy}
                              onClick={() => joined ? openRoom(room.id) : handleJoinRoom(room)}
                            >
                              {joined ? "ENTER ROOM" : "ENTER ROOM"}
                            </button>
                          </article>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="empty-state">
                      <div className="empty-icon"><Icon name="panels-top-left" size={23} /></div>
                      <span className="eyebrow">ROOMS</span>
                      <h2>No public rooms yet.</h2>
                      <p>Create the first live room for the community.</p>
                    </div>
                  )}
                </section>
              )
            )}
          </div>
        </main>

        <nav className="mobile-nav" aria-label="Mobile navigation">
          {[
            ["home", "house", "Home"],
            ["random", "zap", "Random"],
            ["discover", "compass", "Discover"],
            ["messages", "message-circle", "Messages"],
            ["profile", "user-circle-2", "My Profile"]
          ].map(([key, icon, label]) => (
            <button key={key} className={page === key ? "active" : ""} onClick={() => key === "profile" ? setShowProfile(true) : goSocial(key)}>
              <Icon name={icon} size={17} /><span>{label}</span>
            </button>
          ))}
        </nav>
      </div>

      {game && (
        <GameModal
          game={game}
          setGame={setGame}
          rpsChoice={rpsChoice}
          rpsResult={rpsResult}
          onRps={playRps}
          reactionScore={reactionScore}
          reactionActive={reactionActive}
          onStartReaction={startReactionGame}
          onHitReaction={hitReaction}
        />
      )}

      {viewedProfile && (
        <div className="modal-backdrop profile-view-backdrop" onMouseDown={() => setViewedProfile(null)}>
          <div className="modal viewed-profile-modal" onMouseDown={event => event.stopPropagation()}>
            <div className="modal-top">
              <span className="eyebrow">PROFILE</span>
              <button onClick={() => setViewedProfile(null)} aria-label="Close"><Icon name="x" size={16} /></button>
            </div>
            <div className="viewed-profile-hero">
              <div
                className="viewed-profile-photo"
                style={viewedProfile.primary_photo_url ? { backgroundImage: "url(" + viewedProfile.primary_photo_url + ")" } : undefined}
              >
                {!viewedProfile.primary_photo_url && <div className="photo-fallback">{initials(viewedProfile)}</div>}
                {viewedProfile.verified_at && <span className="viewed-profile-verified"><Icon name="badge-check" size={14} /></span>}
                <span className="viewed-profile-status"><i className={viewedProfile.online ? "online-dot" : "offline-dot"} /> {viewedProfile.online ? "ONLINE NOW" : "RECENTLY ACTIVE"}</span>
              </div>
              <div className="viewed-profile-identity">
                <span className="eyebrow">{viewedProfile.username ? "@" + viewedProfile.username : "ELSEWHR MEMBER"}</span>
                <h2>{personName(viewedProfile)}{viewedProfile.age ? ", " + viewedProfile.age : ""}</h2>
                <span>{viewedProfile.country || "Location not shared"}</span>
              </div>
            </div>
            <div className="viewed-profile-scroll">
              {viewedProfile.bio && (
                <div className="viewed-profile-section">
                  <span className="eyebrow">ABOUT</span>
                  <p>{viewedProfile.bio}</p>
                </div>
              )}
              <div className="viewed-profile-section">
                <span className="eyebrow">INTERESTS</span>
                <div className="tags viewed-profile-tags">
                  {(viewedProfile.interests || []).length ? viewedProfile.interests.map(tag => <span key={tag}>{tag}</span>) : <span>No interests added yet.</span>}
                </div>
              </div>
              <div className="viewed-profile-details">
                <div><Icon name="languages" size={15} /><span><small>Languages</small><strong>{(viewedProfile.languages || ["Not shared"]).join(", ")}</strong></span></div>
                <div><Icon name="clock-3" size={15} /><span><small>Profile updated</small><strong>{timeLabel(viewedProfile.updated_at) || "Recently"}</strong></span></div>
              </div>
            </div>
            <div className="viewed-profile-actions">
              <button className="secondary" onClick={() => { setViewedProfile(null); setDiscoverIndex(value => value + 1); }}>
                <Icon name="x" size={15} /> NEXT
              </button>
              <button className="secondary" onClick={() => { setViewedProfile(null); openConnection(viewedProfile); }}>
                <Icon name="message-circle" size={15} /> MESSAGE
              </button>
              <button className="primary" onClick={() => { setViewedProfile(null); handleConnect(viewedProfile); }}>
                <Icon name="heart" size={15} /> CONNECT
              </button>
            </div>
          </div>
        </div>
      )}

      {showProfile && (
        <div className="modal-backdrop" onMouseDown={() => setShowProfile(false)}>
          <div className="modal profile-modal" onMouseDown={e => e.stopPropagation()}>
            <div className="modal-top">
              <span className="eyebrow">{isAnonymous ? "ANONYMOUS" : "MY PROFILE"}</span>
              <button onClick={() => setShowProfile(false)} aria-label="Close"><Icon name="x" size={16} /></button>
            </div>
            <h2>{isAnonymous ? "You're browsing anonymously." : "Your ELSEWHR profile."}</h2>
            <p className="modal-copy">{isAnonymous ? "Create a permanent account to appear in Discover and use live random chat." : "Keep your live identity current and control your account."}</p>

            {!supabaseConfigured ? (
              <div className="form-error">Supabase is not configured for this deployment.</div>
            ) : isAnonymous ? (
              <div className="guest-profile">
                <div className="guest-card"><div className="guest-symbol"><Icon name="user-round" size={20} /></div><div><strong>Anonymous guest</strong><span>This temporary account is tied to this browser session.</span></div></div>
                <div className="profile-buttons guest-actions">
                  <button className="primary" onClick={async () => { setAuthMode("signup"); setShowAuthForm(true); setShowProfile(false); setAccountError(""); await signOut().catch(() => {}); setAuthUser(null); authUserRef.current = null; }}>CREATE ACCOUNT</button>
                  <button className="secondary" onClick={handleSignOut}>LEAVE ELSEWHR</button>
                  <button className="danger-button" disabled={deleteBusy} onClick={handleDeleteAccount}>{deleteBusy ? "DELETING..." : "DELETE ACCOUNT"}</button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleProfileSave} className="quick-profile-form">
                <div className="quick-profile-head">
                  <span className="eyebrow">QUICK START</span>
                  <h3>Three things. Then you're in.</h3>
                  <p>Everything else can be filled in later.</p>
                </div>

                <div className="photo-upload quick-photo-upload">
                  <div className="upload-avatar photo-preview" style={profilePreview ? { backgroundImage: "url(" + profilePreview + ")" } : undefined}>
                    {!profilePreview && <Icon name="camera" size={21} />}
                  </div>
                  <div><strong>{profilePreview ? "Photo ready" : "Add your photo"}</strong><span>One real photo so people know you're real.</span></div>
                  <label className="upload-button">CHOOSE<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e => {
                    const selected = e.target.files?.[0] || null;
                    setProfileFile(selected);
                    if (selected) setProfilePreview(URL.createObjectURL(selected));
                  }} hidden /></label>
                </div>

                <div className="profile-form-grid quick-profile-grid">
                  <label>Name<input id="profile-display-name" required maxLength={50} defaultValue={profile?.display_name || (authUser?.email ? authUser.email.split("@")[0] : "")} placeholder="What should we call you?" autoComplete="name" /></label>
                  <label>Age<input id="profile-age" required type="number" min="18" max="120" defaultValue={profile?.age || ""} placeholder="18+" inputMode="numeric" /></label>
                </div>

                <button type="button" className="advanced-toggle" onClick={() => setShowAdvancedProfileFields(value => !value)}>
                  <span><Icon name="sliders-horizontal" size={14} /> {showAdvancedProfileFields ? "Hide extras" : "Add extras later"}</span>
                  <Icon name={showAdvancedProfileFields ? "chevron-up" : "chevron-down"} size={14} />
                </button>

                {showAdvancedProfileFields && (
                  <div className="profile-extra-fields">
                    <label>Username<input id="profile-username" minLength={3} maxLength={24} defaultValue={profile?.username || ""} placeholder="Optional handle" /></label>
                    <label>Country<input id="profile-country" defaultValue={profile?.country || ""} placeholder="Optional" /></label>
                    <label>Language<input id="profile-language" defaultValue={profile?.languages?.[0] || "English"} placeholder="Optional" /></label>
                    <label>Interests<input id="profile-interests" defaultValue={(profile?.interests || []).join(", ")} placeholder="Music, gaming, books" /></label>
                    <label className="profile-wide">Bio<textarea id="profile-bio" rows="3" defaultValue={profile?.bio || ""} placeholder="Tell people what you're into..." /></label>
                  </div>
                )}

                {accountError && <div className="form-error">{accountError}</div>}
                <div className="profile-buttons quick-profile-actions">
                  <button className="primary" disabled={profileSaving}>{profileSaving ? "SETTING YOU UP..." : "GET ME IN"}</button>
                  <button type="button" className="secondary" onClick={handleSignOut}>SIGN OUT</button>
                </div>
                {!isAnonymous && (
                  <div className="profile-secondary-actions">
                    <button type="button" className="link-button" onClick={() => { setShowProfile(false); setToast("You can finish the extras anytime from My Profile."); }}>Complete profile later</button>
                    <button type="button" className="danger-link" disabled={deleteBusy} onClick={handleDeleteAccount}>{deleteBusy ? "DELETING..." : "Delete account"}</button>
                  </div>
                )}
              </form>
            )}
          </div>
        </div>
      )}

      {showPlus && (
        <div className="modal-backdrop" onMouseDown={() => setShowPlus(false)}>
          <div className="modal plus-modal" onMouseDown={e => e.stopPropagation()}>
            <div className="modal-top"><span className="plus-badge"><Icon name="sparkles" size={12} /> ELSEWHR+</span><button onClick={() => setShowPlus(false)} aria-label="Close"><Icon name="x" size={16} /></button></div>
            <h2>Make ELSEWHR yours.</h2>
            <p className="modal-copy">A subscription for deeper controls and premium account features.</p>
            <div className="plan-toggle">
              <button className={plusPlan === "monthly" ? "selected" : ""} onClick={() => setPlusPlan("monthly")}><strong>$1.99</strong><span>monthly</span></button>
              <button className={plusPlan === "yearly" ? "selected" : ""} onClick={() => setPlusPlan("yearly")}><strong>$19.99</strong><span>yearly · save 16%</span></button>
            </div>
            <div className="plus-grid">
              {["Identity verification","Advanced Discover filters","Unlimited Discover","Persistent images","HD video calls","Custom profiles","Premium themes","Saved conversations","Private rooms","Advanced stats","Ad-free"].map(item => <div key={item}><Icon name="check" size={13} /> {item}</div>)}
            </div>
            <button className="paypal-button" onClick={() => handlePlusCheckout(plusPlan)} disabled={paymentBusy}>{paymentBusy ? "OPENING PAYPAL..." : "CONTINUE WITH PAYPAL · " + (plusPlan === "monthly" ? "$1.99/mo" : "$19.99/yr")}</button>
            <small className="trial-note">Secure subscription checkout · cancel anytime</small>
            {paymentError && <div className="form-error">{paymentError}</div>}
          </div>
        </div>
      )}

      {showReport && (
        <div className="modal-backdrop" onMouseDown={() => setShowReport(false)}>
          <div className="modal report-modal" onMouseDown={e => e.stopPropagation()}>
            <div className="modal-top"><span className="eyebrow">SAFETY</span><button onClick={() => setShowReport(false)} aria-label="Close"><Icon name="x" size={16} /></button></div>
            <h2>Report this member.</h2>
            <p className="modal-copy">Reports are stored on your ELSEWHR account for moderation.</p>
            <div className="report-options">
              {["Sexual or explicit content","Scam or money request","Harassment","Fake identity","Threat or danger","Underage concern","Something else"].map(reason => (
                <button key={reason} disabled={reportBusy} onClick={() => handleReport(reason)}><span>{reason}</span><Icon name="chevron-right" size={15} /></button>
              ))}
            </div>
          </div>
        </div>
      )}

      {showChatMenu && activeOther && (
        <div className="chat-menu" onMouseDown={() => setShowChatMenu(false)}>
          <button onClick={() => { setShowReport(true); setShowChatMenu(false); }}><Icon name="flag" size={14} /> Report member</button>
          <button onClick={handleBlock}><Icon name="shield-ban" size={14} /> Block member</button>
        </div>
      )}

      {toast && (
        <div className="toast cute-toast">
          <span className="toast-orb"><Icon name="sparkles" size={13} /></span>
          <span>{toast}</span>
        </div>
      )}
    </>
  );
}


const GAME_CATALOG = [
  { id:"rps", title:"Rock Paper Scissors", desc:"Quick rounds. Outsmart the room.", icon:"hand-rock", premium:false },
  { id:"reaction", title:"Reaction Rush", desc:"How fast are your reactions?", icon:"zap", premium:false },
  { id:"ttt", title:"Tic Tac Toe", desc:"Classic 3x3 duel.", icon:"grid-3x3", premium:false },
  { id:"chess", title:"Chess", desc:"Classic strategy, ELSEWHR style.", icon:"crown", premium:true },
  { id:"checkers", title:"Checkers", desc:"Fast board battles.", icon:"circle-dot", premium:true },
  { id:"connect4", title:"Connect Four", desc:"Drop four. Win the row.", icon:"columns-3", premium:true },
  { id:"memory", title:"Memory Match", desc:"Flip, remember, match.", icon:"brain", premium:true },
  { id:"2048", title:"2048", desc:"Stack numbers. Chase 2048.", icon:"hash", premium:true },
  { id:"snake", title:"Snake", desc:"Grow without hitting yourself.", icon:"move", premium:true },
  { id:"minesweeper", title:"Minesweeper", desc:"Clear the board without a mistake.", icon:"bomb", premium:true },
  { id:"scramble", title:"Word Scramble", desc:"Unscramble it before time.", icon:"text-cursor-input", premium:true },
  { id:"hangman", title:"Hangman", desc:"Guess the hidden word.", icon:"circle-help", premium:true },
  { id:"sudoku", title:"Sudoku", desc:"Fill every square.", icon:"table-2", premium:true },
  { id:"battleship", title:"Battleship", desc:"Find their fleet first.", icon:"ship-wheel", premium:true },
  { id:"darts", title:"Darts", desc:"Hit the target, chase the score.", icon:"target", premium:true },
  { id:"higher", title:"Higher or Lower", desc:"Call the next card.", icon:"arrow-up-down", premium:true },
];

function NotificationPanel({ notifications, onClose, onClear, onOpenRoom }) {
  return (
    <div className="notification-popover">
      <div className="notification-head">
        <div>
          <span className="eyebrow">ELSEWHR</span>
          <strong>Notifications</strong>
        </div>
        <div className="notification-head-actions">
          {notifications.length > 0 && <button onClick={onClear}>CLEAR</button>}
          <button onClick={onClose} aria-label="Close"><Icon name="x" size={14} /></button>
        </div>
      </div>
      <div className="notification-list">
        {notifications.length ? notifications.map(item => (
          <button key={item.id} className={"notification-item " + (item.read ? "" : "unread")} onClick={() => item.roomId ? onOpenRoom(item.roomId) : onClose()}>
            <span className="notification-icon"><Icon name={item.icon || "bell"} size={15} /></span>
            <span className="notification-copy">
              <strong>{item.title}</strong>
              <small>{item.body}</small>
              <em>{timeLabel(item.created_at)}</em>
            </span>
            {!item.read && <i />}
          </button>
        )) : (
          <div className="notification-empty">
            <div className="notification-empty-icon"><Icon name="bell-off" size={18} /></div>
            <strong>You're all caught up.</strong>
            <span>Messages, room activity and game invites will appear here.</span>
          </div>
        )}
      </div>
    </div>
  );
}

function GamesPage({ isPlus, game, setGame, rpsChoice, rpsResult, onRps, reactionScore, reactionActive, onStartReaction, onHitReaction, onOpenGame, onShowPlus }) {
  return (
    <section className="games-page">
      <div className="section-heading games-heading">
        <div>
          <span className="eyebrow">ELSEWHR ARCADE</span>
          <h2>Play. Compete. Stay awhile.</h2>
        </div>
        <div className="games-count"><strong>3</strong><span>FREE</span><i>+</i><strong>13</strong><span>PLUS</span></div>
      </div>

      <div className="games-intro">
        <p>Three games are open to everyone. Thirteen more are part of ELSEWHR+.</p>
        {!isPlus && <button className="secondary" onClick={onShowPlus}>13 MORE WITH PLUS</button>}
      </div>

      <div className="games-grid">
        {GAME_CATALOG.map(item => (
          <article key={item.id} className={"game-card " + (item.premium ? "premium-game" : "free-game")}>
            <div className="game-card-top">
              <span className="game-icon"><Icon name={item.icon} size={20} /></span>
              {item.premium ? <span className="game-lock"><Icon name={isPlus ? "unlock" : "lock"} size={11} /> {isPlus ? "PLUS" : "PLUS"}</span> : <span className="game-free">FREE</span>}
            </div>
            <h3>{item.title}</h3>
            <p>{item.desc}</p>
            <button className={item.premium && !isPlus ? "secondary" : "primary"} onClick={() => item.id === "ttt" ? onOpenGame(item) : onOpenGame(item)}>
              {item.premium && !isPlus ? "UNLOCK" : "PLAY"}
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

function GameModal({ game, setGame, rpsChoice, rpsResult, onRps, reactionScore, reactionActive, onStartReaction, onHitReaction }) {
  const [board, setBoard] = useState(Array(9).fill(""));
  const [turn, setTurn] = useState("X");
  const [winner, setWinner] = useState("");

  useEffect(() => {
    setBoard(Array(9).fill(""));
    setTurn("X");
    setWinner("");
  }, [game?.id]);

  function playTtt(index) {
    if (board[index] || winner) return;
    const next = [...board];
    next[index] = turn;
    const wins = [
      [0,1,2],[3,4,5],[6,7,8],
      [0,3,6],[1,4,7],[2,5,8],
      [0,4,8],[2,4,6],
    ];
    const hit = wins.find(([a,b,c]) => next[a] && next[a] === next[b] && next[a] === next[c]);
    if (hit) {
      setWinner(turn);
    } else if (next.every(Boolean)) {
      setWinner("draw");
    } else {
      setTurn(turn === "X" ? "O" : "X");
    }
    setBoard(next);
  }

  return (
    <div className="modal-backdrop" onMouseDown={() => setGame(null)}>
      <div className="modal game-modal" onMouseDown={e => e.stopPropagation()}>
        <div className="modal-top">
          <span className="eyebrow">ELSEWHR ARCADE</span>
          <button onClick={() => setGame(null)} aria-label="Close"><Icon name="x" size={16} /></button>
        </div>
        <h2>{game.title}</h2>
        {game.id === "rps" ? (
          <div className="game-panel">
            <p>Choose your move.</p>
            <div className="rps-grid">
              {["rock","paper","scissors"].map(choice => <button key={choice} className={rpsChoice === choice ? "selected" : ""} onClick={() => onRps(choice)}>{choice.toUpperCase()}</button>)}
            </div>
            {rpsResult && <div className="game-result">{rpsResult}</div>}
          </div>
        ) : game.id === "reaction" ? (
          <div className="game-panel reaction-panel">
            <p>Start, wait for the signal, then hit the button.</p>
            <button className={reactionActive ? "reaction-target live" : "reaction-target"} onClick={reactionActive ? onHitReaction : undefined}>
              {reactionActive ? "TAP!" : "WAIT"}
            </button>
            {reactionScore > 0 && <div className="game-result">{reactionScore} ms</div>}
            <button className="secondary" onClick={onStartReaction}>START ROUND</button>
          </div>
        ) : game.id === "ttt" ? (
          <div className="game-panel">
            <p>{winner === "draw" ? "Draw." : winner ? winner + " wins." : "Two players. Take turns."}</p>
            <div className="ttt-grid">
              {board.map((cell, index) => (
                <button key={index} type="button" onClick={() => playTtt(index)} className={cell ? "ttt-cell filled" : "ttt-cell"}>
                  {cell}
                </button>
              ))}
            </div>
            {(winner || board.every(Boolean)) && <button className="secondary" onClick={() => { setBoard(Array(9).fill("")); setTurn("X"); setWinner(""); }}>NEW ROUND</button>}
          </div>
        ) : (
          <div className="game-panel">
            <div className="placeholder-game"><Icon name={game.icon} size={32} /><strong>{game.title}</strong><span>This arcade game is reserved for ELSEWHR+.</span></div>
          </div>
        )}
      </div>
    </div>
  );
}


function TogetherGamePicker({ games, isPlus, onClose, onSelect, onShowPlus }) {
  return (
    <div className="together-overlay" onMouseDown={onClose}>
      <div className="together-picker" onMouseDown={event => event.stopPropagation()}>
        <div className="together-picker-glow glow-one" />
        <div className="together-picker-glow glow-two" />
        <div className="together-picker-top">
          <div>
            <span className="eyebrow">PLAY TOGETHER</span>
            <h3>Do something else.</h3>
            <p>Pick a game and send it straight into this conversation.</p>
          </div>
          <div className="together-arena-controls">
            <button className="together-minimize" onClick={onMinimize} aria-label="Minimize game" title="Minimize">
              <Icon name="minus" size={15} />
            </button>
            <button className="together-close" onClick={onClose} aria-label="End game" title="End game"><Icon name="x" size={15} /></button>
          </div>
        </div>
        <div className="together-game-grid">
          {games.map((item, index) => (
            <button key={item.id} className={"together-game-card " + (item.premium ? "premium" : "free")} style={{ "--delay": (index * 45) + "ms" }} onClick={() => item.premium && !isPlus ? onShowPlus?.() : onSelect(item)}>
              <span className="together-card-icon"><Icon name={item.icon} size={18} /></span>
              <span className="together-card-copy"><strong>{item.title}</strong><small>{item.desc}</small></span>
              <span className="together-card-badge">{item.premium ? "PLUS" : "FREE"}</span>
            </button>
          ))}
        </div>
        <div className="together-picker-footer">
          <span><Icon name="radio" size={12} /> Live over this chat</span>
          {!isPlus && <button onClick={onShowPlus}>13 MORE WITH PLUS</button>}
        </div>
      </div>
    </div>
  );
}

function TogetherGameOverlay({
  game,
  activeOther,
  authUser,
  ttt,
  rps,
  reactionDuel,
  activeMessages,
  message,
  setMessage,
  onChatSend,
  onChatReact,
  onTttMove,
  onRpsMove,
  onStartReaction,
  onHitReaction,
  onMinimize,
  onClose,
}) {
  const mark = game.id === "ttt" ? (ttt.starterId === authUser.id ? "X" : "O") : "";
  const chatMessages = activeMessages.slice(-40);

  return (
    <div className="together-overlay game-layer" onMouseDown={onClose}>
      <div className="together-game-shell" onMouseDown={event => event.stopPropagation()}>
        <div className="together-arena">
          <div className="together-arena-top">
            <div className="versus-line">
              <span className="versus-avatar mine">{initials({ display_name: "Y" })}</span>
              <span className="versus-pulse" />
              <span className="versus-title">{game.title}</span>
              <span className="versus-pulse" />
              <span className="versus-avatar them">{initials(activeOther || { display_name: "E" })}</span>
            </div>
            <div className="together-arena-controls">
              <button className="together-minimize" onClick={onMinimize} aria-label="Minimize game" title="Minimize"><Icon name="minus" size={15} /></button>
              <button className="together-close" onClick={onClose} aria-label="End game" title="End game"><Icon name="x" size={15} /></button>
            </div>
          </div>

          {game.id === "ttt" && (
            <div className="together-play-stage">
              <div className="together-status">{ttt.winner === "draw" ? "DRAW" : ttt.winner ? (ttt.winner === authUser.id ? "YOU WIN" : "THEY WIN") : ttt.turn === authUser.id ? "YOUR TURN" : "THEIR TURN"}</div>
              <div className="duel-board">
                {ttt.board.map((cell, index) => (
                  <button key={index} className={"duel-cell " + (cell ? "filled " + cell.toLowerCase() : "")} onClick={() => onTttMove(index)}>{cell}</button>
                ))}
              </div>
              <small>{mark ? "You are " + mark + "." : "Waiting for the game to start."}</small>
            </div>
          )}

          {game.id === "rps" && (
            <div className="together-play-stage">
              <div className="together-status">{rps.result || (rps.self ? "Waiting for them..." : "Choose your move.")}</div>
              <div className="rps-kinetic">
                {["rock","paper","scissors"].map(choice => (
                  <button key={choice} className={rps.self === choice ? "chosen" : ""} disabled={Boolean(rps.self)} onClick={() => onRpsMove(choice)}>
                    <span>{choice === "rock" ? "✊" : choice === "paper" ? "✋" : "✌️"}</span>
                    <small>{choice}</small>
                  </button>
                ))}
              </div>
              {rps.opponent && <div className="game-result">They played <strong>{rps.opponent}</strong>.</div>}
            </div>
          )}

          {game.id === "reaction" && (
            <div className="together-play-stage">
              <div className="together-status">{reactionDuel.status === "live" ? "GO!" : reactionDuel.self !== null ? "RESULT LOCKED" : "Ready?"}</div>
              <button className={"duel-reaction-target " + (reactionDuel.status === "live" ? "live" : "")} onClick={reactionDuel.status === "live" ? onHitReaction : undefined}>
                {reactionDuel.status === "live" ? "TAP" : reactionDuel.self !== null ? reactionDuel.self + " ms" : "WAIT"}
              </button>
              <button className="secondary" onClick={onStartReaction}>{reactionDuel.self !== null || reactionDuel.opponent !== null ? "REMATCH" : "START DUEL"}</button>
              <div className="reaction-score-row">
                <span>You <strong>{reactionDuel.self === null ? "—" : reactionDuel.self + " ms"}</strong></span>
                <span>{activeOther?.display_name || "Them"} <strong>{reactionDuel.opponent === null ? "—" : reactionDuel.opponent + " ms"}</strong></span>
              </div>
            </div>
          )}

          {!["ttt","rps","reaction"].includes(game.id) && (
            <div className="together-play-stage">
              <div className="premium-game-preview">
                <Icon name={game.icon || "gamepad-2"} size={34} />
                <span className="eyebrow">ELSEWHR+ GAME</span>
                <h3>{game.title}</h3>
                <p>This multiplayer game is reserved for the ELSEWHR+ arcade.</p>
              </div>
            </div>
          )}
        </div>

        <aside className="game-chat-panel">
          <div className="game-chat-head">
            <div>
              <span className="eyebrow">LIVE CHAT</span>
              <strong>Talk while you play</strong>
            </div>
            <span className="game-chat-live"><i /> LIVE</span>
          </div>

          <div className="game-chat-messages">
            {chatMessages.length ? chatMessages.map(item => {
              const mine = item.sender_id === authUser.id;
              return (
                <div key={item.id} className={"game-chat-message " + (mine ? "mine" : "theirs")}>
                  <span>{item.body || (item.media_type ? "📎 Attachment" : "Message")}</span>
                  <small>{mine ? "You" : (activeOther?.display_name || "Them")} · {timeLabel(item.created_at)}</small>
                </div>
              );
            }) : (
              <div className="game-chat-empty">
                <Icon name="messages-square" size={20} />
                <span>Say something while you play.</span>
              </div>
            )}
          </div>

          <form className="game-chat-composer" onSubmit={onChatSend}>
            <input
              value={message}
              onChange={event => setMessage(event.target.value)}
              placeholder="Say something..."
              maxLength={1000}
            />
            <button type="submit" aria-label="Send chat message" disabled={!message.trim()}>
              <Icon name="send" size={14} />
            </button>
          </form>
        </aside>
      </div>
    </div>
  );
}

function LiveChat({
  activeRoom,
  activeOther,
  activeConnection,
  isPlus,
  onShowPlus,
  onNotify,
  onSendAttachment,
  attachmentBusy,
  activeMessages,
  authUser,
  message,
  setMessage,
  editingMessageId,
  replyToMessage,
  openMessageActionsId,
  openReactionId,
  onConnect,
  onSend,
  onStartReply,
  onStartEdit,
  onCancelEdit,
  onDeleteForMe,
  onDeleteForEveryone,
  onReact,
  onCopy,
  onToggleMessageActions,
  onToggleReactionPicker,
  onReport,
  onMenu,
  onSkip,
  onLeave,
}) {
  const reactionChoices = ["❤️", "😂", "🔥", "😍", "😮", "👍"];
  const byId = new Map(activeMessages.map(item => [item.id, item]));
  const [attachmentFile, setAttachmentFile] = useState(null);
  const [attachmentPreview, setAttachmentPreview] = useState("");

  useEffect(() => {
    if (!attachmentFile) {
      setAttachmentPreview("");
      return undefined;
    }
    const url = URL.createObjectURL(attachmentFile);
    setAttachmentPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [attachmentFile]);
  const gameChannelRef = useRef(null);
  const reactionTimerRef = useRef(null);
  const [showTogetherGames, setShowTogetherGames] = useState(false);
  const [togetherGame, setTogetherGame] = useState(null);
  const [togetherMinimized, setTogetherMinimized] = useState(false);
  const [incomingInvite, setIncomingInvite] = useState(null);
  const [ttt, setTtt] = useState({ board: Array(9).fill(""), turn: null, starterId: null, winner: null });
  const [rps, setRps] = useState({ self: null, opponent: null, opponentName: "", result: "" });
  const [reactionDuel, setReactionDuel] = useState({ status: "idle", start: 0, self: null, opponent: null, opponentName: "" });
  const [togetherOpponentId, setTogetherOpponentId] = useState(null);

  const togetherGames = [
    { id:"ttt", title:"Tic Tac Toe", desc:"Take the square. Own the row.", icon:"grid-3x3", premium:false },
    { id:"rps", title:"Rock Paper Scissors", desc:"Read them. Throw first.", icon:"hand-rock", premium:false },
    { id:"reaction", title:"Reaction Duel", desc:"Race their reflexes.", icon:"zap", premium:false },
    { id:"chess", title:"Chess", desc:"Classic strategy, together.", icon:"crown", premium:true },
    { id:"checkers", title:"Checkers", desc:"Fast board battles.", icon:"circle-dot", premium:true },
    { id:"connect4", title:"Connect Four", desc:"Four in a row.", icon:"columns-3", premium:true },
    { id:"memory", title:"Memory Match", desc:"Flip. Remember. Match.", icon:"brain", premium:true },
    { id:"2048", title:"2048", desc:"Build the biggest tile.", icon:"hash", premium:true },
    { id:"snake", title:"Snake", desc:"Grow without crashing.", icon:"move", premium:true },
    { id:"minesweeper", title:"Minesweeper", desc:"Clear it clean.", icon:"bomb", premium:true },
    { id:"scramble", title:"Word Scramble", desc:"Beat the clock.", icon:"text-cursor-input", premium:true },
    { id:"hangman", title:"Hangman", desc:"Find the hidden word.", icon:"circle-help", premium:true },
    { id:"sudoku", title:"Sudoku", desc:"Fill every square.", icon:"table-2", premium:true },
    { id:"battleship", title:"Battleship", desc:"Find their fleet.", icon:"ship-wheel", premium:true },
    { id:"darts", title:"Darts", desc:"Chase the bullseye.", icon:"target", premium:true },
    { id:"higher", title:"Higher or Lower", desc:"Call the next card.", icon:"arrow-up-down", premium:true },
  ];

  function sendTogether(payload) {
    gameChannelRef.current?.send({
      type: "broadcast",
      event: "together_game",
      payload: { ...payload, from: authUser.id },
    }).catch(() => {});
  }

  function resetTogetherState(gameId, starterId = null) {
    if (gameId === "ttt") {
      setTtt({ board: Array(9).fill(""), turn: starterId, starterId, winner: null });
    }
    if (gameId === "rps") {
      setRps({ self: null, opponent: null, opponentName: "", result: "" });
    }
    if (gameId === "reaction") {
      if (reactionTimerRef.current) window.clearTimeout(reactionTimerRef.current);
      setReactionDuel({ status: "waiting", start: 0, self: null, opponent: null, opponentName: "" });
    }
  }

  function beginTogetherGame(gameItem, invite = false) {
    if (gameItem.premium && !isPlus) {
      onShowPlus?.();
      return;
    }
    setShowTogetherGames(false);
    setTogetherGame(gameItem);
    setTogetherMinimized(false);
    setIncomingInvite(null);
    setTogetherOpponentId(activeRoom.kind === "group" ? null : (activeOther?.id || null));
    if (invite) return;

    if (gameItem.id === "ttt" || gameItem.id === "rps") {
      resetTogetherState(gameItem.id, activeRoom.kind === "group" ? null : authUser.id);
      sendTogether({
        kind: "invite",
        gameId: gameItem.id,
        fromName: authUser.user_metadata?.display_name || authUser.user_metadata?.username || "Someone",
        groupRoom: activeRoom.kind === "group",
      });
      onNotify?.({
        type: "game",
        title: "Game invite sent",
        body: "Waiting for someone in this chat to join.",
        roomId: activeRoom.id,
        icon: "gamepad-2",
      });
    } else if (gameItem.id === "reaction") {
      resetTogetherState("reaction");
      sendTogether({
        kind: "invite",
        gameId: "reaction",
        fromName: authUser.user_metadata?.display_name || authUser.user_metadata?.username || "Someone",
        groupRoom: activeRoom.kind === "group",
      });
      onNotify?.({
        type: "game",
        title: "Reaction duel invite sent",
        body: "Waiting for someone to join the duel.",
        roomId: activeRoom.id,
        icon: "zap",
      });
    }
  }

  function acceptTogetherInvite() {
    if (!incomingInvite) return;
    const item = togetherGames.find(candidate => candidate.id === incomingInvite.gameId);
    if (!item) return;
    if (item.premium && !isPlus) {
      onShowPlus?.();
      return;
    }
    setTogetherGame(item);
    setTogetherMinimized(false);
    setIncomingInvite(null);
    setTogetherOpponentId(incomingInvite.from);
    resetTogetherState(item.id, incomingInvite.from);
    const reactionDelay = 1900;
    if (item.id === "reaction") {
      if (reactionTimerRef.current) window.clearTimeout(reactionTimerRef.current);
      reactionTimerRef.current = window.setTimeout(() => {
        setReactionDuel(current => ({ ...current, status: "live", start: performance.now() }));
      }, reactionDelay);
    }
    sendTogether({
      kind: "start",
      gameId: item.id,
      starterId: incomingInvite.from,
      starterName: incomingInvite.fromName || "Player",
      opponentId: authUser.id,
      participants: [incomingInvite.from, authUser.id],
      delay: item.id === "reaction" ? reactionDelay : undefined,
    });
    onNotify?.({
      type: "game",
      title: "Game started",
      body: item.title + " is live.",
      roomId: activeRoom.id,
      icon: item.icon || "gamepad-2",
    });
  }

  function declineTogetherInvite() {
    sendTogether({ kind: "decline", gameId: incomingInvite?.gameId });
    setIncomingInvite(null);
  }

  function closeTogetherGame() {
    if (togetherGame) sendTogether({ kind: "close", gameId: togetherGame.id });
    if (reactionTimerRef.current) window.clearTimeout(reactionTimerRef.current);
    setTogetherGame(null);
    setTogetherMinimized(false);
    setShowTogetherGames(false);
    setIncomingInvite(null);
    setTogetherOpponentId(null);
    setTtt({ board: Array(9).fill(""), turn: null, starterId: null, winner: null });
    setRps({ self: null, opponent: null, opponentName: "", result: "" });
    setReactionDuel({ status: "idle", start: 0, self: null, opponent: null, opponentName: "" });
  }

  function playTttTogether(index) {
    if (!togetherGame || togetherGame.id !== "ttt" || ttt.winner || ttt.turn !== authUser.id || ttt.board[index]) return;
    const mark = ttt.starterId === authUser.id ? "X" : "O";
    const next = [...ttt.board];
    next[index] = mark;
    const wins = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
    const winningLine = wins.find(([a,b,c]) => next[a] && next[a] === next[b] && next[a] === next[c]);
    const winner = winningLine ? authUser.id : next.every(Boolean) ? "draw" : null;
    const nextTurn = winner ? null : (ttt.turn === togetherOpponentId ? authUser.id : togetherOpponentId);
    const nextState = { board: next, turn: nextTurn, starterId: ttt.starterId, winner };
    setTtt(nextState);
    sendTogether({ kind: "ttt_move", state: nextState });
  }

  function playRpsTogether(choice) {
    if (!togetherGame || togetherGame.id !== "rps" || rps.self) return;
    const next = { ...rps, self: choice };
    setRps(next);
    sendTogether({ kind: "rps_move", choice });
  }

  function startReactionDuel() {
    if (!togetherGame || togetherGame.id !== "reaction") return;
    const startDelay = 1900;
    resetTogetherState("reaction");
    sendTogether({
      kind: "reaction_start",
      delay: startDelay,
      fromName: authUser.user_metadata?.display_name || authUser.user_metadata?.username || "Someone",
    });
    reactionTimerRef.current = window.setTimeout(() => {
      setReactionDuel(current => ({ ...current, status: "live", start: performance.now() }));
    }, startDelay);
  }

  function hitReactionDuel() {
    if (reactionDuel.status !== "live" || reactionDuel.self !== null) return;
    const score = Math.max(0, Math.round(performance.now() - reactionDuel.start));
    const next = { ...reactionDuel, self: score, status: "done" };
    setReactionDuel(next);
    sendTogether({ kind: "reaction_score", score });
  }

  useEffect(() => {
    if (!supabase || !activeRoom?.id || !authUser?.id) return;
    const channel = supabase.channel("elsewhr-together-" + activeRoom.id);
    gameChannelRef.current = channel;

    channel
      .on("broadcast", { event: "together_game" }, ({ payload }) => {
        if (!payload || payload.from === authUser.id) return;

        if (payload.kind === "invite") {
          const item = togetherGames.find(candidate => candidate.id === payload.gameId);
          if (item) {
            setIncomingInvite({ ...payload, item });
            onNotify?.({
              type: "game",
              title: "Game invite",
              body: (payload.fromName || "Someone") + " wants to play " + item.title + ".",
              roomId: activeRoom.id,
              icon: item.icon || "gamepad-2",
            });
          }
          return;
        }

        if (payload.kind === "decline") {
          setTogetherGame(null);
          setIncomingInvite(null);
          return;
        }

        if (payload.kind === "start") {
          const participants = Array.isArray(payload.participants) ? payload.participants : [];
          if (participants.length && !participants.includes(authUser.id)) return;
          const item = togetherGames.find(candidate => candidate.id === payload.gameId);
          if (!item) return;
          const peerId = participants.find(id => id !== authUser.id) || payload.from || null;
          setTogetherOpponentId(peerId);
          setTogetherGame(item);
          setTogetherMinimized(false);
          setIncomingInvite(null);
          resetTogetherState(item.id, payload.starterId || payload.from);
          if (item.id === "reaction") {
            const delay = Number(payload.delay) || 1900;
            resetTogetherState("reaction");
            if (reactionTimerRef.current) window.clearTimeout(reactionTimerRef.current);
            reactionTimerRef.current = window.setTimeout(() => {
              setReactionDuel(current => ({ ...current, status: "live", start: performance.now() }));
            }, delay);
          }
          return;
        }

        if (payload.kind === "ttt_move") {
          setTtt(payload.state);
          return;
        }

        if (payload.kind === "rps_move") {
          setRps(current => {
            const next = { ...current, opponent: payload.choice, opponentName: payload.fromName || "Opponent" };
            if (next.self) {
              const won = (next.self === "rock" && payload.choice === "scissors") || (next.self === "paper" && payload.choice === "rock") || (next.self === "scissors" && payload.choice === "paper");
              next.result = next.self === payload.choice ? "DRAW" : won ? "YOU WIN" : "YOU LOSE";
            }
            return next;
          });
          return;
        }

        if (payload.kind === "reaction_start") {
          if (reactionTimerRef.current) window.clearTimeout(reactionTimerRef.current);
          const delay = Number(payload.delay) || 1900;
          setReactionDuel({ status: "waiting", start: 0, self: null, opponent: null, opponentName: payload.fromName || "Opponent" });
          reactionTimerRef.current = window.setTimeout(() => {
            setReactionDuel(current => ({ ...current, status: "live", start: performance.now() }));
          }, delay);
          return;
        }

        if (payload.kind === "reaction_score") {
          setReactionDuel(current => ({ ...current, opponent: payload.score, opponentName: payload.fromName || "Opponent" }));
          return;
        }

        if (payload.kind === "close") {
          setTogetherGame(null);
          setTogetherMinimized(false);
          setIncomingInvite(null);
          setTogetherOpponentId(null);
          if (reactionTimerRef.current) window.clearTimeout(reactionTimerRef.current);
        }
      })
      .subscribe();

    return () => {
      if (reactionTimerRef.current) window.clearTimeout(reactionTimerRef.current);
      gameChannelRef.current = null;
      supabase.removeChannel(channel);
    };
  }, [activeRoom?.id, authUser?.id]);

  useEffect(() => () => {
    if (reactionTimerRef.current) window.clearTimeout(reactionTimerRef.current);
  }, []);

  return (
    <section className="chat-page live-chat">
      <div className="chat-header">
        <div className="person-mini">
          <div className="mini-avatar real-small-avatar" style={activeOther?.primary_photo_url ? { backgroundImage: "url(" + activeOther.primary_photo_url + ")" } : undefined}>
            {!activeOther?.primary_photo_url && initials(activeOther || { username: activeRoom.title || activeRoom.kind })}
          </div>
          <div>
            <strong>{activeRoom.kind === "group" ? (activeRoom.title || "Room") : personName(activeOther)}</strong>
            <span><i /> {activeRoom.kind === "group" ? "Public room" : (activeOther?.country || "ELSEWHR member")}</span>
          </div>
        </div>
        <div className="chat-header-actions">
          <button className="chat-play-button" aria-label="Play together" onClick={() => setShowTogetherGames(true)}>
            <Icon name="gamepad-2" size={14} /> PLAY
          </button>
          {onSkip && (
            <button className="chat-skip" aria-label="Skip this chat" onClick={onSkip}>
              <Icon name="skip-forward" size={14} /> SKIP
            </button>
          )}
          {activeRoom.kind === "random" && activeOther && (
            <button
              className={activeConnection?.status === "accepted" ? "chat-connect accepted" : "chat-connect"}
              aria-label={activeConnection?.status === "accepted" ? "Friends" : "Add friend"}
              onClick={() => onConnect?.(activeOther)}
              disabled={activeConnection?.status === "accepted"}
            >
              <Icon name={activeConnection?.status === "accepted" ? "heart" : "user-plus"} size={14} />
              {activeConnection?.status === "accepted" ? "FRIENDS" : activeConnection?.status === "pending" && activeConnection?.direction === "incoming" ? "ACCEPT" : "ADD FRIEND"}
            </button>
          )}
          {activeRoom.kind !== "group" && (
            <button aria-label="More options" onClick={onMenu}><Icon name="ellipsis" size={16} /></button>
          )}
        </div>
      </div>

      {incomingInvite && (
        <div className="game-invite-pop">
          <div className="game-invite-orb"><Icon name={incomingInvite.item?.icon || "gamepad-2"} size={18} /></div>
          <div className="game-invite-copy">
            <span>GAME INVITE</span>
            <strong>{incomingInvite.fromName || "Someone"} wants to play {incomingInvite.item?.title || "together"}.</strong>
          </div>
          <div className="game-invite-actions">
            <button className="primary" onClick={acceptTogetherInvite}>PLAY</button>
            <button className="secondary" onClick={declineTogetherInvite}>NOT NOW</button>
          </div>
        </div>
      )}

      {showTogetherGames && !togetherGame && (
        <TogetherGamePicker
          games={togetherGames}
          isPlus={isPlus}
          onClose={() => setShowTogetherGames(false)}
          onSelect={beginTogetherGame}
          onShowPlus={onShowPlus}
        />
      )}

      {togetherGame && togetherMinimized && (
        <button className="minimized-game-dock" onClick={() => setTogetherMinimized(false)} aria-label={"Restore " + togetherGame.title}>
          <span className="minimized-game-icon"><Icon name={togetherGame.icon || "gamepad-2"} size={15} /></span>
          <span className="minimized-game-copy">
            <strong>{togetherGame.title}</strong>
            <small>GAME IN PROGRESS</small>
          </span>
          <span className="minimized-game-live"><i /> LIVE</span>
          <Icon name="chevron-up" size={15} />
        </button>
      )}

      {togetherGame && !togetherMinimized && (
        <TogetherGameOverlay
          game={togetherGame}
          activeOther={activeOther}
          authUser={authUser}
          ttt={ttt}
          rps={rps}
          reactionDuel={reactionDuel}
          activeMessages={activeMessages}
          authUser={authUser}
          message={message}
          setMessage={setMessage}
          onChatSend={onSend}
          onChatReact={onReact}
          onTttMove={playTttTogether}
          onRpsMove={playRpsTogether}
          onStartReaction={startReactionDuel}
          onHitReaction={hitReactionDuel}
          onMinimize={() => setTogetherMinimized(true)}
          onClose={closeTogetherGame}
        />
      )}

      <div className="chat-body">
        <div className="chat-intro">
          <div className="large-avatar real-avatar" style={activeOther?.primary_photo_url ? { backgroundImage: "url(" + activeOther.primary_photo_url + ")" } : undefined}>
            {!activeOther?.primary_photo_url && initials(activeOther || { username: activeRoom.title || activeRoom.kind })}
          </div>
          <h2>{activeRoom.kind === "group" ? (activeRoom.title || "Room") : personName(activeOther)}</h2>
          <div className="meta">{activeRoom.kind === "group" ? (activeRoom.description || "Live public room") : (activeOther?.country || "ELSEWHR member")}</div>
        </div>

        <div className="message-stack">
          {activeMessages.length ? activeMessages.map(item => {
            const isMine = item.sender_id === authUser.id;
            const reply = item.reply_to_id ? byId.get(item.reply_to_id) : null;
            const groupedReactions = (item.reactions || []).reduce((map, row) => {
              if (!map[row.reaction]) map[row.reaction] = { count: 0, mine: false };
              map[row.reaction].count += 1;
              if (row.user_id === authUser.id) map[row.reaction].mine = true;
              return map;
            }, {});

            return (
              <div key={item.id} className={"message-row message-row-rich " + (isMine ? "me" : "them")}>
                <div className="message-bubble-wrap">
                  {reply && (
                    <button className="message-reply-preview" type="button" onClick={() => document.getElementById("message-" + reply.id)?.scrollIntoView({ behavior: "smooth", block: "center" })}>
                      <strong>{reply.sender_id === authUser.id ? "You" : "Reply"}</strong>
                      <span>{reply.deleted_at ? "Message deleted" : (reply.body || "Attachment")}</span>
                    </button>
                  )}

                  <div className={"bubble " + (item.deleted_at ? "deleted-bubble" : "")}>
                    {item.deleted_at ? (
                      <span>Message deleted</span>
                    ) : item.media_url ? (
                      <div className="attachment-message">
                        {item.media_type?.startsWith("image/") ? (
                          <a href={item.media_url} target="_blank" rel="noreferrer" className="attachment-image-link">
                            <img src={item.media_url} alt={item.media_name || "Shared image"} className="attachment-image" />
                          </a>
                        ) : item.media_type?.startsWith("video/") ? (
                          <video className="attachment-video" controls preload="metadata" src={item.media_url} />
                        ) : item.media_type?.startsWith("audio/") ? (
                          <audio className="attachment-audio" controls src={item.media_url} />
                        ) : (
                          <a className="attachment-file" href={item.media_url} target="_blank" rel="noreferrer">
                            <span className="attachment-file-icon"><Icon name="file-text" size={17} /></span>
                            <span><strong>{item.media_name || "Attachment"}</strong><small>{item.media_size ? Math.ceil(item.media_size / 1024) + " KB" : "File"}</small></span>
                            <Icon name="arrow-up-right" size={14} />
                          </a>
                        )}
                        {item.body && <span className="attachment-caption">{item.body}</span>}
                      </div>
                    ) : (
                      <span>{item.body}</span>
                    )}
                    <small>{timeLabel(item.created_at)}{item.edited_at && !item.deleted_at ? " · edited" : ""}</small>
                  </div>

                  {!!Object.keys(groupedReactions).length && (
                    <div className="message-reactions">
                      {Object.entries(groupedReactions).map(([reaction, info]) => (
                        <button key={reaction} className={info.mine ? "reaction-chip mine" : "reaction-chip"} type="button" onClick={() => onReact(item, reaction)}>
                          <span>{reaction}</span><small>{info.count}</small>
                        </button>
                      ))}
                    </div>
                  )}

                  {!item.deleted_at && (
                    <div className="message-hover-actions">
                      <button type="button" aria-label="React" onClick={() => onToggleReactionPicker(item.id)}><Icon name="smile-plus" size={14} /></button>
                      <button type="button" aria-label="Reply" onClick={() => onStartReply(item)}><Icon name="reply" size={14} /></button>
                      <button type="button" aria-label="More" onClick={() => onToggleMessageActions(item.id)}><Icon name="ellipsis" size={14} /></button>
                    </div>
                  )}

                  {openReactionId === item.id && !item.deleted_at && (
                    <div className={"reaction-picker " + (isMine ? "right" : "left")}>
                      {reactionChoices.map(reaction => (
                        <button key={reaction} type="button" onClick={() => onReact(item, reaction)}>{reaction}</button>
                      ))}
                    </div>
                  )}

                  {openMessageActionsId === item.id && (
                    <div className={"message-action-menu " + (isMine ? "right" : "left")}>
                      <button type="button" onClick={() => onStartReply(item)}><Icon name="reply" size={13} /> Reply</button>
                      {!item.deleted_at && <button type="button" onClick={() => onToggleReactionPicker(item.id)}><Icon name="smile-plus" size={13} /> React</button>}
                      {!!item.body && <button type="button" onClick={() => onCopy(item)}><Icon name="copy" size={13} /> Copy</button>}
                      {isMine && !item.deleted_at && <button type="button" onClick={() => onStartEdit(item)}><Icon name="pencil" size={13} /> Edit</button>}
                      <button type="button" onClick={() => onDeleteForMe(item)}><Icon name="trash-2" size={13} /> Delete for me</button>
                      {isMine && !item.deleted_at && <button type="button" className="danger-menu-item" onClick={() => onDeleteForEveryone(item)}><Icon name="trash" size={13} /> Delete for everyone</button>}
                      {!isMine && <button type="button" onClick={onReport}><Icon name="flag" size={13} /> Report</button>}
                    </div>
                  )}
                </div>
              </div>
            );
          }) : (
            <div className="room-empty-line">No messages in this room yet.</div>
          )}
        </div>
      </div>

      {replyToMessage && (
        <div className="composer-context">
          <div>
            <span>{editingMessageId ? "Editing message" : "Replying to"} {replyToMessage.sender_id === authUser.id ? "yourself" : "member"}</span>
            <strong>{replyToMessage.body || "Attachment"}</strong>
          </div>
          <button type="button" onClick={onCancelEdit} aria-label="Clear message context"><Icon name="x" size={14} /></button>
        </div>
      )}

      {editingMessageId && !replyToMessage && (
        <div className="composer-context">
          <div><span>Editing message</span><strong>Make your change below.</strong></div>
          <button type="button" onClick={onCancelEdit} aria-label="Cancel edit"><Icon name="x" size={14} /></button>
        </div>
      )}

      {attachmentFile && (
        <div className="attachment-compose">
          {attachmentPreview && attachmentFile.type?.startsWith("image/") ? (
            <img src={attachmentPreview} alt="Attachment preview" />
          ) : (
            <div className="attachment-compose-icon"><Icon name={attachmentFile.type?.startsWith("video/") ? "video" : attachmentFile.type?.startsWith("audio/") ? "volume-2" : "file"} size={17} /></div>
          )}
          <div><strong>{attachmentFile.name}</strong><small>{Math.max(1, Math.ceil(attachmentFile.size / 1024))} KB</small></div>
          <button type="button" onClick={() => setAttachmentFile(null)} aria-label="Remove attachment"><Icon name="x" size={14} /></button>
        </div>
      )}

      <form className="composer" onSubmit={async event => {
        if (attachmentFile) {
          event.preventDefault();
          if (attachmentBusy) return;
          await onSendAttachment?.(attachmentFile, message);
          setAttachmentFile(null);
          return;
        }
        onSend(event);
      }}>
        <input ref={input => { if (input) input._elsewhrFileInput = input; }} id={"attachment-input-" + activeRoom.id} className="attachment-file-input" type="file" accept="image/*,video/*,audio/*,.pdf,.txt,.zip,.doc,.docx,.xls,.xlsx" onChange={event => {
          const file = event.target.files?.[0] || null;
          if (file) setAttachmentFile(file);
          event.target.value = "";
        }} />
        <button type="button" className="composer-attach" aria-label="Attach file" onClick={() => document.getElementById("attachment-input-" + activeRoom.id)?.click()}>
          <Icon name="paperclip" size={16} />
        </button>
        <input value={message} onChange={e => setMessage(e.target.value)} placeholder={editingMessageId ? "Edit message..." : attachmentFile ? "Add a caption..." : replyToMessage ? "Write your reply..." : "Message..."} autoFocus={Boolean(editingMessageId)} />
        <button type="button" className="composer-cancel" onClick={() => { if (attachmentFile) setAttachmentFile(null); else if (editingMessageId || replyToMessage) onCancelEdit(); }} disabled={!attachmentFile && !editingMessageId && !replyToMessage}><Icon name="x" size={15} /></button>
        <button className="send" aria-label={attachmentFile ? "Send attachment" : editingMessageId ? "Save edit" : "Send"} type="submit" disabled={attachmentBusy}><Icon name={attachmentBusy ? "loader-circle" : editingMessageId ? "check" : "send"} size={16} /></button>
      </form>

      <div className="chat-actions">
        {activeRoom.kind !== "group" && (
          <button onClick={onReport}><Icon name="flag" size={15} /> REPORT</button>
        )}
        <button onClick={onLeave}><Icon name="log-out" size={15} /> LEAVE</button>
      </div>
    </section>
  );
}

createRoot(document.getElementById("root")).render(<App />);