import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import ReactMarkdown from "react-markdown";
import "./styles.css";

const api = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/+$/, "");

type User = { id: string; name: string; city?: string; _count?: { properties: number; conversations: number } };
type Message = { id?: string; role: string; content: string; createdAt?: string };
type ToolLog = { id: string; toolName: string; input: unknown; output: unknown; executionTimeMs: number; createdAt: string };
type Conversation = { id: string; userId: string; user?: User; updatedAt: string; messages?: Message[]; toolLogs?: ToolLog[]; _count?: { messages: number; toolLogs: number } };

function MessageBody({ message }: { message: Message }) {
  if (message.role !== "assistant") return <p>{message.content}</p>;
  return <div className="message-content"><ReactMarkdown>{message.content}</ReactMarkdown></div>;
}

function plainTextPreview(content: string) {
  return content
    .replace(/!?\[([^\]]+)\]\([^\s)]+\)/g, "$1")
    .replace(/[*_`#>~]/g, "")
    .replace(/^\s*[-+]\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  let response: Response;
  try {
    response = await fetch(`${api}${normalizedPath}`, {
      ...init,
      headers,
      signal: init?.signal ?? AbortSignal.timeout(45000),
    });
  } catch (error) {
    if (error instanceof Error && /abort|timeout/i.test(error.name + error.message)) {
      throw new Error("The server took too long to respond. Please try again.");
    }
    throw new Error("Could not reach the API. Check the deployment URL and server status.");
  }
  const responseText = await response.text();
  let body: any = {};
  if (responseText) {
    try {
      body = JSON.parse(responseText);
    } catch {
      if (!response.ok) throw new Error(`API request failed with status ${response.status}. Check VITE_API_BASE_URL and the Render service routes.`);
      throw new Error("The API returned HTML instead of JSON. Check the deployed API URL.");
    }
  }
  if (!response.ok) throw new Error(body.error ?? `Request failed with status ${response.status}.`);
  return body as T;
}

function Icon({ name }: { name: "building" | "chat" | "briefcase" | "plus" | "send" | "refresh" | "spark" }) {
  const paths = {
    building: <><path d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16"/><path d="M8 7h4M8 11h4M8 15h4M2 21h20M16 9h2a2 2 0 0 1 2 2v10"/></>,
    chat: <><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/><path d="M8 9h8M8 13h5"/></>,
    briefcase: <><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18M10 12v2h4v-2"/></>,
    plus: <><path d="M12 5v14M5 12h14"/></>,
    send: <><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></>,
    refresh: <><path d="M20 6v5h-5M4 18v-5h5"/><path d="M18.5 9A7 7 0 0 0 6 6.5L4 11M5.5 15A7 7 0 0 0 18 17.5l2-4.5"/></>,
    spark: <><path d="m12 3-1.2 3.8L7 8l3.8 1.2L12 13l1.2-3.8L17 8l-3.8-1.2Z"/><path d="m5 14-.8 2.2L2 17l2.2.8L5 20l.8-2.2L8 17l-2.2-.8Z"/></>,
  };
  return <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function Chat() {
  const [users, setUsers] = useState<User[]>([]);
  const [userId, setUserId] = useState("");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationId, setConversationId] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const messagesPanel = useRef<HTMLDivElement>(null);
  const selectedUser = users.find((user) => user.id === userId);

  useEffect(() => {
    requestJson<User[]>("/api/users").then((items) => { setUsers(items); if (items.length) setUserId(items[0].id); }).catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    setConversationId(""); setMessages([]); setConversations([]);
    if (userId) requestJson<Conversation[]>(`/api/chat/conversations?userId=${encodeURIComponent(userId)}`).then(setConversations).catch((e) => setError(e.message));
  }, [userId]);
  useEffect(() => {
    const panel = messagesPanel.current;
    if (!panel) return;
    const frame = requestAnimationFrame(() => {
      panel.scrollTo({ top: panel.scrollHeight, behavior: messages.length > 1 ? "smooth" : "auto" });
    });
    return () => cancelAnimationFrame(frame);
  }, [messages, busy]);

  async function openConversation(id: string) {
    setError("");
    try {
      const item = await requestJson<Conversation>(`/api/chat/conversations/${encodeURIComponent(id)}?userId=${encodeURIComponent(userId)}`);
      setConversationId(item.id); setMessages(item.messages ?? []);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load conversation."); }
  }

  async function send(messageOverride?: string) {
    const message = (messageOverride ?? text).trim();
    if (!message || !userId || busy) return;
    setText(""); setError(""); setBusy(true);
    setMessages((items) => [...items, { role: "user", content: message }]);
    try {
      const body = await requestJson<{ conversationId: string; message: string }>("/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, conversationId: conversationId || undefined, message }),
      });
      setConversationId(body.conversationId);
      setMessages((items) => [...items, { role: "assistant", content: body.message }]);
      // Sidebar data is secondary to the answer. Refresh it without keeping the
      // composer blocked by another network round trip.
      void requestJson<Conversation[]>(`/api/chat/conversations?userId=${encodeURIComponent(userId)}`)
        .then(setConversations)
        .catch((refreshError) => console.warn("Conversation refresh failed", refreshError));
    } catch (e) {
      setMessages((items) => items.slice(0, -1)); setText(message);
      setError(e instanceof Error ? e.message : "Request failed.");
    } finally { setBusy(false); }
  }

  const suggestions = ["What is my total portfolio value?", "Compare my retail and office properties", "How many of my properties are occupied?"];
  return <main className="app-shell chat-layout">
    <aside className="surface sidebar">
      <div className="profile-card"><div className="avatar">{selectedUser?.name?.[0] ?? "U"}</div><div><small>Active portfolio</small><strong>{selectedUser?.name ?? "Loading…"}</strong><span>{selectedUser?.city ?? userId}</span></div></div>
      <label className="field-label" htmlFor="portfolio-user">Switch portfolio</label>
      <select id="portfolio-user" value={userId} onChange={(e) => setUserId(e.target.value)}>{users.map((u) => <option key={u.id} value={u.id}>{u.name} · {u.id}</option>)}</select>
      <button className="button primary full" onClick={() => { setConversationId(""); setMessages([]); }}><Icon name="plus"/>New analysis</button>
      <div className="section-label"><span>Recent conversations</span><span className="count-pill">{conversations.length}</span></div>
      <div className="conversation-list">{conversations.map((c) => <button className={`conversation ${c.id === conversationId ? "selected" : ""}`} key={c.id} onClick={() => openConversation(c.id)}><span>{plainTextPreview(c.messages?.[0]?.content ?? "Portfolio analysis")}</span><small>{new Date(c.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</small></button>)}{!conversations.length && <div className="sidebar-empty">Your conversations will appear here.</div>}</div>
    </aside>
    <section className="surface chat-card">
      <header className="chat-header"><div><span className="eyebrow"><Icon name="spark"/>AI powered analysis</span><h1>Portfolio Analyst</h1><p>Ask questions, compare holdings, or model a scenario using your live portfolio data.</p></div><span className="live-status"><i/>Connected</span></header>
      <div ref={messagesPanel} className="messages" aria-live="polite">
        {!messages.length && <div className="welcome-state"><div className="welcome-icon"><Icon name="building"/></div><h2>Make smarter portfolio decisions</h2><p>Start with one of these common questions or ask your own.</p><div className="suggestions">{suggestions.map((item) => <button key={item} onClick={() => send(item)}>{item}</button>)}</div></div>}
        {messages.map((m, i) => <div key={m.id ?? i} className={`message-row ${m.role}`}><div className="message-avatar">{m.role === "assistant" ? <Icon name="spark"/> : selectedUser?.name?.[0]}</div><article><span className="message-author">{m.role === "assistant" ? "Portfolio AI" : "You"}</span><MessageBody message={m}/></article></div>)}
        {busy && <div className="message-row assistant"><div className="message-avatar"><Icon name="spark"/></div><article className="thinking"><span/><span/><span/></article></div>}
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="composer"><textarea aria-label="Message" rows={1} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} placeholder="Ask about this portfolio…"/><button className="send-button" aria-label="Send message" onClick={() => send()} disabled={busy || !userId || !text.trim()}><Icon name="send"/></button></div>
      <p className="composer-note">Enter to send · Shift + Enter for a new line</p>
    </section>
  </main>;
}

function Admin() {
  const [users, setUsers] = useState<User[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [attention, setAttention] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const adminGet = <T,>(path: string) => requestJson<T>(path);
  async function refresh() {
    setLoading(true);
    try {
      const [u, c, a] = await Promise.all([adminGet<User[]>("/api/admin/users"), adminGet<Conversation[]>("/api/admin/conversations"), adminGet<Conversation[]>("/api/admin/attention-needed")]);
      setUsers(u); setConversations(c); setAttention(a); setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load dashboard."); }
    finally { setLoading(false); }
  }
  useEffect(() => { refresh(); }, []);
  async function inspect(id: string) {
    try { setSelected(await adminGet<Conversation>(`/api/admin/conversations/${encodeURIComponent(id)}`)); setError(""); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not load conversation."); }
  }
  const toolCalls = conversations.reduce((sum, item) => sum + (item._count?.toolLogs ?? 0), 0);
  return <main className="app-shell admin-shell">
    <section className="admin-heading"><div><span className="eyebrow"><Icon name="briefcase"/>Operations center</span><h1>Business overview</h1><p>Monitor usage, agent activity, and conversations that need review.</p></div><div className="admin-actions"><button className="button secondary" onClick={refresh} disabled={loading}><Icon name="refresh"/>{loading ? "Refreshing" : "Refresh"}</button></div></section>
    {error && <p className="error" role="alert">{error}</p>}
    <section className="stats-grid">
      <div className="stat-card"><div className="stat-icon blue"><Icon name="building"/></div><div><span>Portfolio users</span><strong>{users.length}</strong><small>Active profiles</small></div></div>
      <div className="stat-card"><div className="stat-icon purple"><Icon name="chat"/></div><div><span>Conversations</span><strong>{conversations.length}</strong><small>Across all users</small></div></div>
      <div className="stat-card"><div className="stat-icon green"><Icon name="spark"/></div><div><span>Tool activity</span><strong>{toolCalls}</strong><small>Recorded calls</small></div></div>
      <div className="stat-card"><div className="stat-icon amber"><span>!</span></div><div><span>Needs attention</span><strong>{attention.length}</strong><small>Flagged sessions</small></div></div>
    </section>
    <section className="admin-grid">
      <div className="surface data-card"><div className="card-heading"><div><h2>Recent conversations</h2><p>Review message and tool activity</p></div><span className="count-pill">{conversations.length}</span></div><div className="table-wrap"><table><thead><tr><th>User</th><th>Last activity</th><th>Messages</th><th>Tools</th><th></th></tr></thead><tbody>{conversations.map((c) => <tr key={c.id}><td><div className="table-user"><span>{(c.user?.name ?? c.userId)[0]}</span><div><strong>{c.user?.name ?? c.userId}</strong><small>{c.userId}</small></div></div></td><td>{new Date(c.updatedAt).toLocaleString()}</td><td>{c._count?.messages ?? 0}</td><td>{c._count?.toolLogs ?? 0}</td><td><button className="text-button" onClick={() => inspect(c.id)}>Inspect →</button></td></tr>)}</tbody></table>{!loading && !conversations.length && <div className="table-empty">No conversations found.</div>}</div></div>
      <aside className="surface attention-card"><div className="card-heading"><div><h2>Attention queue</h2><p>Sessions with errors</p></div></div>{attention.length ? attention.map((c) => <button className="attention-item" key={c.id} onClick={() => inspect(c.id)}><span className="alert-dot">!</span><span><strong>{c.user?.name ?? c.userId}</strong><small>Open conversation review</small></span><b>→</b></button>) : <div className="all-clear"><span>✓</span><strong>All clear</strong><p>No conversations need attention.</p></div>}</aside>
    </section>
    {selected && <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setSelected(null); }}><section className="detail-modal"><div className="card-heading"><div><span className="eyebrow">Conversation detail</span><h2>{selected.user?.name ?? selected.userId}</h2><p>{selected.id}</p></div><button className="close-button" onClick={() => setSelected(null)} aria-label="Close">×</button></div><div className="detail-grid"><div><h3>Messages</h3>{selected.messages?.map((m) => <article className="log-item" key={m.id}><span className={`role-tag ${m.role}`}>{m.role}</span><p>{m.content}</p></article>)}</div><div><h3>Tool activity</h3>{selected.toolLogs?.map((log) => <article className="log-item" key={log.id}><div className="log-title"><strong>{log.toolName}</strong><span>{log.executionTimeMs} ms</span></div><small>{new Date(log.createdAt).toLocaleString()}</small><details><summary>View input and output</summary><pre>{JSON.stringify({ input: log.input, output: log.output }, null, 2)}</pre></details></article>)}{!selected.toolLogs?.length && <p className="muted">No tool calls recorded.</p>}</div></div></section></div>}
  </main>;
}

function App() {
  const [page, setPage] = useState<"chat" | "admin">("chat");
  return <><nav className="topbar"><button className="brand" onClick={() => setPage("chat")}><span className="brand-mark"><Icon name="building"/></span><span><strong>EstateIQ</strong><small>Portfolio intelligence</small></span></button><div className="nav-tabs"><button className={page === "chat" ? "active" : ""} onClick={() => setPage("chat")}><Icon name="chat"/>Portfolio AI</button><button className={page === "admin" ? "active" : ""} onClick={() => setPage("admin")}><Icon name="briefcase"/>Business</button></div></nav>{page === "chat" ? <Chat/> : <Admin/>}</>;
}

createRoot(document.getElementById("root")!).render(<StrictMode><App/></StrictMode>);
