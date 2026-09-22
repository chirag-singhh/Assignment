import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const api = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:5000";
type User = { id: string; name: string; city?: string };
type Message = {
  id?: string;
  role: string;
  content: string;
  createdAt?: string;
};
type Conversation = {
  id: string;
  userId: string;
  user?: User;
  updatedAt: string;
  messages?: Message[];
  toolLogs?: ToolLog[];
  _count?: { messages: number; toolLogs: number };
};
type ToolLog = {
  id: string;
  toolName: string;
  input: unknown;
  output: unknown;
  executionTimeMs: number;
  createdAt: string;
};

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${api}${path}`);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "Request failed.");
  return body as T;
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

  useEffect(() => {
    getJson<User[]>("/api/admin/users")
      .then((items) => {
        setUsers(items);
        if (items.length) setUserId(items[0].id);
      })
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    setConversationId("");
    setMessages([]);
    setConversations([]);
    if (userId)
      getJson<Conversation[]>(
        `/api/chat/conversations?userId=${encodeURIComponent(userId)}`,
      )
        .then(setConversations)
        .catch((e) => setError(e.message));
  }, [userId]);

  async function openConversation(id: string) {
    setError("");
    try {
      const item = await getJson<Conversation>(
        `/api/chat/conversations/${encodeURIComponent(id)}?userId=${encodeURIComponent(userId)}`,
      );
      setConversationId(item.id);
      setMessages(item.messages ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load conversation.");
    }
  }

  async function send() {
    const message = text.trim();
    if (!message || !userId || busy) return;
    setText("");
    setError("");
    setBusy(true);
    setMessages((items) => [...items, { role: "user", content: message }]);
    try {
      const response = await fetch(`${api}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          conversationId: conversationId || undefined,
          message,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Request failed.");
      setConversationId(body.conversationId);
      setMessages((items) => [
        ...items,
        { role: "assistant", content: body.message },
      ]);
      setConversations(
        await getJson<Conversation[]>(
          `/api/chat/conversations?userId=${encodeURIComponent(userId)}`,
        ),
      );
    } catch (e) {
      setMessages((items) => items.slice(0, -1));
      setText(message);
      setError(e instanceof Error ? e.message : "Request failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="layout">
      <aside className="panel sidebar">
        <h2>Your portfolio</h2>
        <label>
          User
          <select value={userId} onChange={(e) => setUserId(e.target.value)}>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.id})
              </option>
            ))}
          </select>
        </label>
        <button
          className="secondary full"
          onClick={() => {
            setConversationId("");
            setMessages([]);
          }}
        >
          New conversation
        </button>
        <h3>Conversations</h3>
        {conversations.map((c) => (
          <button
            className={`conversation ${c.id === conversationId ? "selected" : ""}`}
            key={c.id}
            onClick={() => openConversation(c.id)}
          >
            <span>{c.messages?.[0]?.content ?? "Conversation"}</span>
            <small>{new Date(c.updatedAt).toLocaleString()}</small>
          </button>
        ))}
        {!conversations.length && (
          <p className="muted">No conversations yet.</p>
        )}
      </aside>
      <section className="panel chat">
        <header>
          <h1>Portfolio Analyst</h1>
          <p>
            Ask about properties, comparisons, rental income, or a hypothetical
            change.
          </p>
        </header>
        <div className="messages" aria-live="polite">
          {!messages.length && (
            <p className="empty">Try “What does my portfolio look like?”</p>
          )}
          {messages.map((m, i) => (
            <article key={m.id ?? i} className={m.role}>
              {m.content}
            </article>
          ))}
          {busy && <article className="assistant">Thinking…</article>}
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="composer">
          <input
            aria-label="Message"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") send();
            }}
            placeholder="Ask about your portfolio"
          />
          <button onClick={send} disabled={busy || !userId || !text.trim()}>
            Send
          </button>
        </div>
      </section>
    </main>
  );
}

function Admin() {
  const [users, setUsers] = useState<User[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [attention, setAttention] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [error, setError] = useState("");
  async function refresh() {
    try {
      const [u, c, a] = await Promise.all([
        getJson<User[]>("/api/admin/users"),
        getJson<Conversation[]>("/api/admin/conversations"),
        getJson<Conversation[]>("/api/admin/attention-needed"),
      ]);
      setUsers(u);
      setConversations(c);
      setAttention(a);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load dashboard.");
    }
  }
  useEffect(() => {
    refresh();
  }, []);
  async function inspect(id: string) {
    try {
      setSelected(
        await getJson<Conversation>(
          `/api/admin/conversations/${encodeURIComponent(id)}`,
        ),
      );
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load conversation.");
    }
  }
  return (
    <main className="admin panel">
      <div className="heading">
        <div>
          <h1>Business dashboard</h1>
          <p className="muted">Conversation and tool activity</p>
        </div>
        <button onClick={refresh}>Refresh</button>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="stats">
        <div>
          <strong>{users.length}</strong>
          <span>Users</span>
        </div>
        <div>
          <strong>{conversations.length}</strong>
          <span>Conversations</span>
        </div>
        <div>
          <strong>{attention.length}</strong>
          <span>Need attention</span>
        </div>
      </div>
      <h2>Needs attention</h2>
      {attention.length ? (
        attention.map((c) => (
          <button
            className="attention"
            key={c.id}
            onClick={() => inspect(c.id)}
          >
            {c.user?.name ?? c.userId} · {c.id}
          </button>
        ))
      ) : (
        <p className="muted">No conversations flagged.</p>
      )}
      <h2>Conversations</h2>
      <div className="tableWrap">
        <table>
          <thead>
            <tr>
              <th>User</th>
              <th>Updated</th>
              <th>Messages</th>
              <th>Tool calls</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {conversations.map((c) => (
              <tr key={c.id}>
                <td>{c.user?.name ?? c.userId}</td>
                <td>{new Date(c.updatedAt).toLocaleString()}</td>
                <td>{c._count?.messages ?? 0}</td>
                <td>{c._count?.toolLogs ?? 0}</td>
                <td>
                  <button className="secondary" onClick={() => inspect(c.id)}>
                    Inspect
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {selected && (
        <section className="detail">
          <div className="heading">
            <div>
              <h2>{selected.user?.name ?? selected.userId}</h2>
              <p className="muted">Conversation {selected.id}</p>
            </div>
            <button className="secondary" onClick={() => setSelected(null)}>
              Close
            </button>
          </div>
          <div className="detailGrid">
            <div>
              <h3>Messages</h3>
              {selected.messages?.map((m) => (
                <article className="logItem" key={m.id}>
                  <strong>{m.role}</strong>
                  <p>{m.content}</p>
                </article>
              ))}
            </div>
            <div>
              <h3>Tool activity</h3>
              {selected.toolLogs?.map((log) => (
                <article className="logItem" key={log.id}>
                  <strong>{log.toolName}</strong>
                  <small>
                    {log.executionTimeMs} ms ·{" "}
                    {new Date(log.createdAt).toLocaleString()}
                  </small>
                  <details>
                    <summary>Input and output</summary>
                    <pre>
                      {JSON.stringify(
                        { input: log.input, output: log.output },
                        null,
                        2,
                      )}
                    </pre>
                  </details>
                </article>
              ))}
              {!selected.toolLogs?.length && (
                <p className="muted">No tool calls.</p>
              )}
            </div>
          </div>
        </section>
      )}
    </main>
  );
}

function App() {
  const [page, setPage] = useState<"chat" | "admin">("chat");
  return (
    <>
      <nav>
        <strong>AI Real Estate Portfolio Analyst</strong>
        <div>
          <button
            className={page === "chat" ? "" : "secondary"}
            onClick={() => setPage("chat")}
          >
            Chat
          </button>
          <button
            className={page === "admin" ? "" : "secondary"}
            onClick={() => setPage("admin")}
          >
            Business
          </button>
        </div>
      </nav>
      {page === "chat" ? <Chat /> : <Admin />}
    </>
  );
}
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
