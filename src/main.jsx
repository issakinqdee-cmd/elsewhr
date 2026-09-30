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

const PAGE_ORDER = ["home", "random", "discover", "connections", "messages", "rooms"];

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
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [replyToMessage, setReplyToMessage] = useState(null);
  const [openMessageActionsId, setOpenMessageActionsId] = useState(null);
  const [openReactionId, setOpenReactionId] = useState(null);
  const [dataBusy, setDataBusy] = useState(false);
  const [dataError, setDataError] = useState("");

  const [discoverOnlineOnly, setDiscoverOnlineOnly] = useState(false);
  const [discoverVerifiedOnly, setDiscoverVerifiedOnly] = useState(false);
  const [discoverIndex, setDiscoverIndex] = useState(0);

  const [isMatching, setIsMatching] = useState(false);
  const [matchingSince, setMatchingSince] = useState(null);

  const [roomTitle, setRoomTitle] = useState("");
  const [roomDescription, setRoomDescription] = useState("");
  const [roomBusy, setRoomBusy] = useState(false);

  const [showPlus, setShowPlus] = useState(false);
  const [plusPlan, setPlusPlan] = useState("monthly");
  const [paymentBusy, setPaymentBusy] = useState(false);
  const [paymentError, setPaymentError] = useState("");

  const [showReport, setShowReport] = useState(false);
  const [reportBusy, setReportBusy] = useState(false);
  const [showChatMenu, setShowChatMenu] = useState(false);

  const [toast, setToast] = useState("");
  const activeRoomRef = useRef(null);
  const authUserRef = useRef(null);
  const isMatchingRef = useRef(false);
  const matchingSinceRef = useRef(null);
  const isAnonymous = Boolean(authUser?.is_anonymous);
  const profileReady = Boolean(authUser && (isAnonymous || (profile?.primary_photo_path && profile?.age >= 18 && profile?.username)));
  const onlineCount = discoverPeople.filter(person => person.online).length;
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

  const messageRooms = rooms.filter(room => room.kind === "direct" || room.kind === "random");
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
      const baseRoom = typeof roomOrId === "string"
        ? rooms.find(room => room.id === roomOrId)
        : roomOrId;
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
    if (!isAnonymous && !profileReady) {
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
    if (!authUser || !activeRoom || !message.trim()) return;
    const body = message.trim();
    const currentReply = replyToMessage;
    const currentEditId = editingMessageId;
    setMessage("");
    setReplyToMessage(null);
    setEditingMessageId(null);

    try {
      if (currentEditId) {
        await editTextMessage(currentEditId, authUser.id, body);
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
    if (!isAnonymous && !profileReady) {
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
      await refreshAll();
      await openRoom(room.id);
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
      .on("postgres_changes", { event: "*", schema: "public", table: "connections" }, async () => {
        await refreshAll();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "rooms" }, async () => {
        await refreshAll();
        if (activeRoomRef.current?.id) {
          try {
            const freshRoom = await getRoom(activeRoomRef.current.id);
            setCurrentRoom(freshRoom);
          } catch {
            // Ignore room refresh races while a room is being left.
          }
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "room_members" }, async () => {
        await refreshAll();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, async () => {
        await refreshAll();
        if (activeRoomRef.current?.id) await refreshMessages(activeRoomRef.current.id);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "message_reactions" }, async () => {
        if (activeRoomRef.current?.id) await refreshMessages(activeRoomRef.current.id);
        await refreshAll();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "message_deletions" }, async () => {
        if (activeRoomRef.current?.id) await refreshMessages(activeRoomRef.current.id);
        await refreshAll();
      })
      .subscribe();

    const markOffline = () => {
      touchPresence(false).catch(() => {});
    };
    window.addEventListener("beforeunload", markOffline);

    return () => {
      disposed = true;
      window.clearInterval(heartbeat);
      window.removeEventListener("beforeunload", markOffline);
      supabase.removeChannel(channel);
      touchPresence(false).catch(() => {});
    };
  }, [authUser?.id]);

  useEffect(() => {
    activeRoomRef.current = activeRoom;
  }, [activeRoom]);

  useEffect(() => {
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
          <div className="welcome-logo">E</div>
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
          <div className="auth-gate-logo"><span className="brand-mark">E</span><strong>ELSEWHR</strong></div>
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
          <div className="auth-gate-logo"><span className="brand-mark">E</span><strong>ELSEWHR</strong></div>
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
  ];

  return (
    <>
      <div className="app-shell">
        <aside className="sidebar">
          <button className="brand" onClick={() => navigateTo("home")}>
            <span className="brand-mark">E</span><span>ELSEWHR</span>
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
            <div className="online-pill"><span className="status-dot" /> {onlineCount} people online</div>
            <div className="top-actions">
              <button onClick={() => setShowPlus(true)}><Icon name="sparkles" size={14} /> Get Plus</button>
              <button className="avatar-button" onClick={() => setShowProfile(true)}>{initials(profile || { username: isAnonymous ? "guest" : authUser.email })}</button>
            </div>
          </header>

          {dataError && (
            <div className="live-error">
              <Icon name="circle-alert" size={14} /> {dataError}
            </div>
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
                  <div><strong>{onlineCount}</strong><span>online now</span></div>
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
                      <div className="profile-photo real-photo" style={currentDiscoverPerson.primary_photo_url ? { backgroundImage: "url(" + currentDiscoverPerson.primary_photo_url + ")" } : undefined}>
                        {!currentDiscoverPerson.primary_photo_url && <div className="photo-fallback">{initials(currentDiscoverPerson)}</div>}
                        {currentDiscoverPerson.verified_at && <div className="verified-placeholder"><Icon name="badge-check" size={17} /></div>}
                        <div className="live-photo-meta">
                          <strong>{personName(currentDiscoverPerson)}</strong>
                          <span><i className={currentDiscoverPerson.online ? "online-dot" : "offline-dot"} /> {currentDiscoverPerson.online ? "Online now" : "Offline"}</span>
                        </div>
                      </div>
                      <div className="profile-info">
                        <div className="name-line">
                          <h3>{personName(currentDiscoverPerson)}{currentDiscoverPerson.age ? ", " + currentDiscoverPerson.age : ""}</h3>
                        </div>
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

      {toast && <div className="toast">{toast}</div>}
    </>
  );
}

function LiveChat({
  activeRoom,
  activeOther,
  activeConnection,
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
  onLeave,
}) {
  const reactionChoices = ["❤️", "😂", "🔥", "😍", "😮", "👍"];
  const byId = new Map(activeMessages.map(item => [item.id, item]));

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
          <button aria-label="More options" onClick={onMenu}><Icon name="ellipsis" size={16} /></button>
        </div>
      </div>

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
                    <span>{item.deleted_at ? "Message deleted" : item.media_type ? item.media_type + " message" : item.body}</span>
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

      <form className="composer" onSubmit={onSend}>
        <input value={message} onChange={e => setMessage(e.target.value)} placeholder={editingMessageId ? "Edit message..." : replyToMessage ? "Write your reply..." : "Message..."} autoFocus={Boolean(editingMessageId)} />
        <button type="button" className="composer-cancel" onClick={() => { if (editingMessageId || replyToMessage) onCancelEdit(); }} disabled={!editingMessageId && !replyToMessage}><Icon name="x" size={15} /></button>
        <button className="send" aria-label={editingMessageId ? "Save edit" : "Send"} type="submit"><Icon name={editingMessageId ? "check" : "send"} size={16} /></button>
      </form>

      <div className="chat-actions">
        <button onClick={onReport}><Icon name="flag" size={15} /> REPORT</button>
        <button onClick={onLeave}><Icon name="log-out" size={15} /> LEAVE</button>
      </div>
    </section>
  );
}

createRoot(document.getElementById("root")).render(<App />);