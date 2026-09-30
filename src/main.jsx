import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { supabase, supabaseConfigured } from "./lib/supabase";
import { getCurrentUser, saveProfile, signInWithEmail, signOut, signUpWithEmail, uploadAvatar } from "./lib/account";
import { startPaypalSubscription } from "./lib/paypal";

const discoverPeople = [
  { name: "Maya", age: 24, country: "South Africa", flag: "🇿🇦", vibe: "Music", tags: ["Music", "Movies", "Late Night"], bio: "Good conversations > small talk.", gradient: "linear-gradient(145deg,#f6c9b8,#6e4658)" },
  { name: "Alex", age: 22, country: "USA", flag: "🇺🇸", vibe: "Gaming", tags: ["Gaming", "Tech", "Anime"], bio: "Probably awake when I shouldn't be.", gradient: "linear-gradient(145deg,#a9bfff,#433d72)" },
  { name: "Amara", age: 25, country: "Nigeria", flag: "🇳🇬", vibe: "Deep", tags: ["Music", "Books", "Deep Talk"], bio: "Ask me something you actually care about.", gradient: "linear-gradient(145deg,#d0b1ff,#4d384e)" },
  { name: "Kabelo", age: 23, country: "Botswana", flag: "🇧🇼", vibe: "Chill", tags: ["Basketball", "Music", "Memes"], bio: "Here for the random conversations.", gradient: "linear-gradient(145deg,#9ad6bd,#2d4c45)" }
];


const ICON_BASE = "https://api.iconify.design/lucide:";
function Icon({ name, size = 18, alt = "" }) {
  return <img className="ui-icon" src={`${ICON_BASE}${name}.png?color=%23c8ff52&width=${size}&height=${size}`} width={size} height={size} alt={alt} aria-hidden={!alt} />;
}

const messages = [
  { side: "them", text: "yo", time: "19:41" },
  { side: "me", text: "hey 😂", time: "19:42" },
  { side: "them", text: "where are you from?", time: "19:42" },
  { side: "me", text: "Botswana 🇧🇼", time: "19:43" }
];

function App() {
  const [page, setPage] = useState("home");
  const [showProfile, setShowProfile] = useState(false);
  const [showPlus, setShowPlus] = useState(false);
  const [showGenesis, setShowGenesis] = useState(false);
  const [showCall, setShowCall] = useState(null);
  const [discoverIndex, setDiscoverIndex] = useState(0);
  const [liked, setLiked] = useState(false);
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState([]);
  const [authUser, setAuthUser] = useState(null);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authMode, setAuthMode] = useState("signin");
  const [authBusy, setAuthBusy] = useState(false);
  const [profileFile, setProfileFile] = useState(null);
  const [profileSaving, setProfileSaving] = useState(false);
  const [accountError, setAccountError] = useState("");
  const [paymentBusy, setPaymentBusy] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  const person = discoverPeople[discoverIndex % discoverPeople.length];

  useEffect(() => {
    if (!supabase) return;
    getCurrentUser().then(setAuthUser).catch(() => setAuthUser(null));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthUser(session?.user ?? null);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  async function handleAuth(e) {
    e.preventDefault();
    setAuthBusy(true);
    setAccountError("");
    try {
      const result = authMode === "signin"
        ? await signInWithEmail(authEmail, authPassword)
        : await signUpWithEmail(authEmail, authPassword);
      setAuthUser(result.user ?? result.session?.user ?? null);
      if (authMode === "signup" && !result.session) {
        setAccountError("Check your email to confirm your ELSEWHR account, then sign in.");
      }
    } catch (error) {
      setAccountError(error.message || "Authentication failed.");
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleProfileSave(e) {
    e.preventDefault();
    if (!authUser) return;
    setProfileSaving(true);
    setAccountError("");
    try {
      let photo = null;
      if (profileFile) photo = await uploadAvatar(authUser.id, profileFile);
      await saveProfile({
        id: authUser.id,
        username: (document.getElementById("profile-username")?.value || authEmail.split("@")[0]).replace(/[^a-zA-Z0-9_]/g, "").slice(0, 24) || `elsewhr_${authUser.id.slice(0, 8)}`,
        display_name: document.getElementById("profile-display-name")?.value || null,
        age: Number(document.getElementById("profile-age")?.value || 18),
        country: document.getElementById("profile-country")?.value || null,
        languages: ["English"],
        interests: ["Music"],
        bio: document.getElementById("profile-bio")?.value || null,
        primary_photo_path: photo?.path ?? null,
        primary_photo_url: photo?.publicUrl ?? null,
        discoverable: Boolean(photo),
      });
      setShowProfile(false);
    } catch (error) {
      setAccountError(error.message || "Could not save your profile.");
    } finally {
      setProfileSaving(false);
    }
  }

  async function handlePlusCheckout(plan = "monthly") {
    if (!authUser) {
      setShowProfile(true);
      setShowPlus(false);
      return;
    }
    setPaymentBusy(true);
    setPaymentError("");
    try {
      if (!supabase) throw new Error("Supabase is not configured.");
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

  const currentMessages = useMemo(() => [...messages, ...sent], [sent]);

  const nav = [
    ["home", "house", "Home"],
    ["random", "zap", "Random"],
    ["discover", "compass", "Discover"],
    ["connections", "heart", "Connections"],
    ["messages", "message-circle", "Messages"],
    ["rooms", "panels-top-left", "Rooms"],
    ["games", "gamepad-2", "Games"]
  ];

  function nextPerson() {
    setDiscoverIndex(v => v + 1);
    setLiked(false);
    setPage("random");
  }

  function sendMessage(e) {
    e.preventDefault();
    const trimmed = message.trim();
    if (!trimmed) return;
    setSent(v => [...v, { side: "me", text: trimmed, time: "now" }]);
    setMessage("");
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => setPage("home")}>
          <span className="brand-mark">E</span>
          <span>ELSEWHR</span>
        </button>

        <div className="side-section">
          <span className="side-label">EXPLORE</span>
          {nav.map(([key, icon, label]) => (
            <button key={key} className={`nav-item ${page === key ? "active" : ""}`} onClick={() => setPage(key)}>
              <span className="nav-icon"><Icon name={icon} /></span><span>{label}</span>
            </button>
          ))}
        </div>

        <div className="side-section">
          <span className="side-label">NEXT</span>
          <button className="genesis-nav" onClick={() => setShowGenesis(true)}>
            <span className="nav-icon"><Icon name="sparkles" /></span>
            <span>
              <strong>GENESIS</strong>
              <small>Coming soon</small>
            </span>
          </button>
        </div>

        <div className="sidebar-bottom">
          <button className="nav-item" onClick={() => setShowProfile(true)}><span className="nav-icon"><Icon name="user-circle-2" /></span><span>Profile</span></button>
          <button className="nav-item" onClick={() => setShowPlus(true)}><span className="nav-icon"><Icon name="sparkles" /></span><span>ELSEWHR+</span></button>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="mobile-brand">ELSEWHR</div>
          <div className="online-pill"><span className="status-dot" /> 8,491 elsewhere right now</div>
          <div className="top-actions">
            <button onClick={() => setShowPlus(true)}><Icon name="sparkles" size={14} /> Get Plus</button>
            <button className="avatar-button" onClick={() => setShowProfile(true)}>T</button>
          </div>
        </header>

        <div className="content">
          {page === "home" && (
            <section className="hero-page">
              <div className="eyebrow">THE INTERNET IS BIGGER THAN YOUR CIRCLE</div>
              <h1>Someone,<br /><span>somewhere,</span><br />is waiting.</h1>
              <p>Meet people outside your usual world. Talk, discover, connect, and decide what happens next.</p>
              <div className="hero-actions">
                <button className="primary large" onClick={() => setPage("random")}>GO ELSEWHR <Icon name="arrow-up-right" size={16} /></button>
                <button className="secondary large" onClick={() => setPage("discover")}>DISCOVER PEOPLE</button>
              </div>
              <div className="hero-grid">
                <div><strong>1 → 1</strong><span>Instant private chat</span></div>
                <div><strong><Icon name="globe-2" size={20} /></strong><span>People anywhere</span></div>
                <div><strong><Icon name="infinity" size={20} /></strong><span>Go somewhere else</span></div>
              </div>
            </section>
          )}

          {page === "random" && (
            <section className="chat-page">
              <div className="chat-header">
                <div className="person-mini">
                  <div className="mini-avatar" style={{background: person.gradient}}>{person.name[0]}</div>
                  <div><strong>{person.name}_482</strong><span><i /> {person.country}</span></div>
                </div>
                <div className="chat-header-actions">
                  <button onClick={() => setShowCall("voice")}><Icon name="phone" size={14} /> Voice</button>
                  <button onClick={() => setShowCall("video")}><Icon name="video" size={14} /> Video</button>
                  <button aria-label="More options"><Icon name="ellipsis" size={16} /></button>
                </div>
              </div>

              <div className="chat-body">
                <div className="chat-intro">
                  <div className="large-avatar" style={{background: person.gradient}}>{person.name[0]}</div>
                  <h2>{person.name}_482</h2>
                  <div className="meta">{person.flag} {person.country} · {person.vibe}</div>
                  <div className="tags">{person.tags.map(tag => <span key={tag}>{tag}</span>)}</div>
                </div>

                <div className="message-stack">
                  {currentMessages.map((m, i) => (
                    <div key={i} className={`message-row ${m.side}`}>
                      <div className="bubble">{m.text}<small>{m.time}</small></div>
                    </div>
                  ))}
                  <div className="typing"><span /><span /><span /> {person.name}_482 is typing...</div>
                </div>
              </div>

              <form className="composer" onSubmit={sendMessage}>
                <button type="button" aria-label="Emoji"><Icon name="smile" size={17} /></button>
                <button type="button" title="Images"><Icon name="image" size={17} /></button>
                <button type="button" title="Voice note"><Icon name="mic" size={17} /></button>
                <input value={message} onChange={e => setMessage(e.target.value)} placeholder="Message..." />
                <button className="send" aria-label="Send" type="submit"><Icon name="send" size={16} /></button>
              </form>

              <div className="chat-actions">
                <button className="next-button" onClick={nextPerson}><Icon name="refresh-cw" size={15} /> NEXT</button>
                <button className={liked ? "liked" : ""} onClick={() => setLiked(v => !v)}><Icon name="heart" size={15} /> {liked ? "SAVED" : "SAVE"}</button>
                <button><Icon name="flag" size={15} /> REPORT</button>
                <button><Icon name="log-out" size={15} /> LEAVE</button>
              </div>
            </section>
          )}

          {page === "discover" && (
            <section className="discover-page">
              <div className="section-heading">
                <div><span className="eyebrow">DISCOVER</span><h2>Choose your elsewhere.</h2></div>
                <button className="secondary" onClick={() => setShowPlus(true)}>Unlock more filters <Icon name="sparkles" size={14} /></button>
              </div>
              <div className="discover-layout">
                <div className="profile-card">
                  <div className="profile-photo" style={{background: person.gradient}}>
                    <div className="verified-placeholder"><Icon name="badge-check" size={17} /></div>
                    <div className="photo-caption">{person.name}</div>
                  </div>
                  <div className="profile-info">
                    <div className="name-line"><h3>{person.name}, {person.age}</h3><span>{person.flag}</span></div>
                    <span className="country-line">{person.country}</span>
                    <p>{person.bio}</p>
                    <div className="tags">{person.tags.map(tag => <span key={tag}>{tag}</span>)}</div>
                    <div className="swipe-actions">
                      <button className="round-button pass" onClick={nextPerson} aria-label="Pass"><Icon name="x" size={22} /></button>
                      <button className="round-button super" onClick={() => setShowPlus(true)} aria-label="Super connect"><Icon name="sparkles" size={20} /></button>
                      <button className="round-button connect" onClick={() => { setLiked(true); setPage("connections"); }} aria-label="Connect"><Icon name="heart" size={21} /></button>
                    </div>
                  </div>
                </div>
                <div className="discover-side">
                  <div className="filter-card">
                    <div className="filter-title">QUICK FILTERS</div>
                    <label><input type="checkbox" /> Online now</label>
                    <label><input type="checkbox" /> Verified</label>
                    <label><input type="checkbox" /> Music</label>
                    <label><input type="checkbox" /> Gaming</label>
                    <button className="filter-plus" onClick={() => setShowPlus(true)}>Advanced filters are a Plus feature <Icon name="arrow-up-right" size={13} /></button>
                  </div>
                  <div className="quote-card">
                    <span>ELSEWHR THOUGHT</span>
                    <strong>Don't just meet people. Find conversations you remember.</strong>
                  </div>
                </div>
              </div>
            </section>
          )}

          {page === "connections" && (
            <section className="simple-page">
              <span className="eyebrow">CONNECTIONS</span>
              <h2>People you decided to keep.</h2>
              <div className="connection-grid">
                {discoverPeople.slice(0,3).map((p, i) => (
                  <article className="connection-card" key={p.name}>
                    <div className="conn-avatar" style={{background:p.gradient}}>{p.name[0]}</div>
                    <div><h3>{p.name}</h3><span>{p.flag} {p.country}</span></div>
                    <button onClick={() => setPage("random")}>CHAT</button>
                  </article>
                ))}
              </div>
            </section>
          )}

          {["messages","rooms","games"].includes(page) && (
            <section className="simple-page">
              <span className="eyebrow">{page.toUpperCase()}</span>
              <h2>{page === "messages" ? "Your conversations live here." : page === "rooms" ? "Find a room worth staying in." : "Talk is better with games."}</h2>
              <div className="coming-grid">
                <div><strong>{page === "messages" ? "Messages" : page === "rooms" ? "Public rooms" : "Mini games"}</strong><span>Prototype surface ready. Realtime features connect next.</span></div>
                <div><strong>Genesis</strong><span>Private-space experience is coming later.</span></div>
              </div>
            </section>
          )}
        </div>
      </main>

      {showProfile && (
        <div className="modal-backdrop" onMouseDown={() => setShowProfile(false)}>
          <div className="modal profile-modal" onMouseDown={e => e.stopPropagation()}>
            <div className="modal-top"><span className="eyebrow">CREATE PROFILE</span><button onClick={() => setShowProfile(false)} aria-label="Close"><Icon name="x" size={16} /></button></div>
            <h2>Show people there's a real person here.</h2>
            <p className="modal-copy">A real primary photo helps us keep ELSEWHR human and reduces fake, explicit, and spam-heavy profiles.</p>
            {!supabaseConfigured && <div className="verification-callout"><span><Icon name="info" size={18} /></span><div><strong>Prototype mode</strong><p>Connect the Supabase environment to enable real accounts, profile storage and realtime features.</p></div></div>}
            {supabaseConfigured && !authUser && (
              <form onSubmit={handleAuth} className="auth-form">
                <div className="auth-toggle"><button type="button" className={authMode === "signin" ? "selected" : ""} onClick={() => setAuthMode("signin")}>Sign in</button><button type="button" className={authMode === "signup" ? "selected" : ""} onClick={() => setAuthMode("signup")}>Create account</button></div>
                <label>Email<input type="email" required value={authEmail} onChange={e => setAuthEmail(e.target.value)} placeholder="you@example.com" /></label>
                <label>Password<input type="password" minLength={8} required value={authPassword} onChange={e => setAuthPassword(e.target.value)} placeholder="At least 8 characters" /></label>
                {accountError && <div className="form-error">{accountError}</div>}
                <button className="primary full" disabled={authBusy}>{authBusy ? "WORKING..." : authMode === "signin" ? "SIGN IN" : "CREATE ACCOUNT"}</button>
              </form>
            )}
            {supabaseConfigured && authUser && (
              <form onSubmit={handleProfileSave}>
                <div className="photo-upload">
                  <div className="upload-avatar"><Icon name="image-plus" size={21} /></div>
                  <div><strong>Add your picture</strong><span>Primary photo required for discovery</span></div>
                  <label className="upload-button">Choose<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e => setProfileFile(e.target.files?.[0] ?? null)} hidden /></label>
                </div>
                <div className="profile-form-grid">
                  <label>Username<input id="profile-username" placeholder="your_username" /></label>
                  <label>Display name<input id="profile-display-name" placeholder="Theo" /></label>
                  <label>Age<input id="profile-age" type="number" min="18" placeholder="18+" /></label>
                  <label>Country<input id="profile-country" placeholder="Botswana" /></label>
                  <label>Language<input defaultValue="English" /></label>
                </div>
                <label className="profile-wide">Bio<textarea id="profile-bio" rows="3" placeholder="Tell people what you're into..." /></label>
                {accountError && <div className="form-error">{accountError}</div>}
                <div className="verification-callout">
                  <span><Icon name="shield-check" size={18} /></span>
                  <div><strong>Verification</strong><p>ELSEWHR+ will include identity verification and verified-only discovery.</p></div>
                </div>
                <div className="profile-buttons"><button className="primary" disabled={profileSaving}>{profileSaving ? "SAVING..." : "SAVE PROFILE"}</button><button type="button" className="secondary" onClick={() => signOut().then(() => setAuthUser(null))}>SIGN OUT</button></div>
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
            <p className="modal-copy">More control over who you meet, how you appear, and how you stay connected.</p>
            <div className="price-row"><strong>$1.99</strong><span>/ month · $19.99 / year</span></div>
            <div className="plus-grid">
              {["Identity verification","Advanced Discover filters","Unlimited Discover","Who liked you","Persistent images","HD video calls","Custom profiles","Premium themes","Saved conversations","Private rooms","Advanced stats","Ad-free"].map(item => <div key={item}><Icon name="check" size={13} /> {item}</div>)}
            </div>
            <button className="paypal-button" onClick={() => handlePlusCheckout("monthly")} disabled={paymentBusy}>{paymentBusy ? "OPENING PAYPAL..." : "Pay with PayPal"}</button>
            <small className="trial-note">7-day trial · cancel anytime</small>{paymentError && <div className="form-error">{paymentError}</div>}
          </div>
        </div>
      )}

      {showGenesis && (
        <div className="modal-backdrop" onMouseDown={() => setShowGenesis(false)}>
          <div className="modal genesis-modal" onMouseDown={e => e.stopPropagation()}>
            <div className="genesis-symbol"><Icon name="sparkles" size={24} /></div>
            <span className="eyebrow">GENESIS</span>
            <h2>A different kind of connection is coming.</h2>
            <p className="modal-copy">A future private space for deeper connections. For now, Genesis stays intentionally quiet.</p>
            <button className="primary full" onClick={() => setShowGenesis(false)}><Icon name="arrow-left" size={15} /> BACK TO ELSEWHR</button>
          </div>
        </div>
      )}

      {showCall && (
        <div className="modal-backdrop call-layer">
          <div className="call-modal">
            <div className="call-top"><span>ELSEWHR · {showCall.toUpperCase()}</span><span>00:42</span></div>
            <div className="call-stage" style={{background: person.gradient}}>
              <div className="call-name">{person.name}_482</div>
              {showCall === "video" && <div className="self-preview">YOU</div>}
            </div>
            <div className="call-controls">
              <button aria-label="Mute"><Icon name="mic-off" size={18} /></button><button aria-label="Camera"><Icon name="video" size={18} /></button><button className="end-call" onClick={() => setShowCall(null)} aria-label="End call"><Icon name="phone-off" size={18} /></button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);