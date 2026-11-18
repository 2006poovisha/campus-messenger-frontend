
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { io } from "socket.io-client";
import API from "../api";

function ChatPage() {
  const navigate = useNavigate();

  const socketRef = useRef(null);
  const bottomRef = useRef(null);
  const selectedIdRef = useRef(null);

  const userData = localStorage.getItem("user");
  const user = userData ? JSON.parse(userData) : null;
  const userId = user?.id;
  const token = localStorage.getItem("token");

  const [classmates, setClassmates] = useState([]);
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [content, setContent] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);

  // Keep selected classmate ID updated
  selectedIdRef.current = selected?._id || null;

  // Load classmates and connect Socket.IO only once per login
  useEffect(() => {
    if (!token || !userId) {
      navigate("/");
      return;
    }

    let active = true;

    API.get("/api/users")
      .then((res) => {
        if (active) setClassmates(res.data);
      })
      .catch(() => {
        if (active) setError("Unable to load classmates");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    const socket = io(
   import.meta.env.VITE_API_URL || "https://campus-messenger-backend.onrender.com",
      {
        auth: { token },
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
      }
    );

    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      setError("");
      console.log("Socket connected:", socket.id);
    });

    socket.on("disconnect", () => {
      setConnected(false);
      console.log("Socket disconnected");
    });

    socket.on("connect_error", (err) => {
      setConnected(false);
      setError("Real-time connection failed: " + err.message);
      console.error("Socket error:", err.message);
    });

    // Receive messages only for the currently selected conversation
    socket.on("receive_message", (message) => {
      const senderId = message.sender?._id || message.sender;
      const receiverId = message.receiver?._id || message.receiver;
      const currentSelectedId = selectedIdRef.current;

      if (
        currentSelectedId &&
        String(senderId) === String(currentSelectedId) &&
        String(receiverId) === String(userId)
      ) {
        setMessages((previous) => {
          if (previous.some((item) => item._id === message._id)) {
            return previous;
          }
          return [...previous, message];
        });
      }
    });

    return () => {
      active = false;
      socket.off();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token, userId, navigate]);

  // Load selected classmate's chat history
  useEffect(() => {
    if (!selected) {
      setMessages([]);
      return;
    }

    let active = true;

    setMessages([]);
    setError("");

    API.get(`/api/messages/${selected._id}`)
      .then((res) => {
        if (active) setMessages(res.data);
      })
      .catch(() => {
        if (active) setError("Unable to load chat history");
      });

    return () => {
      active = false;
    };
  }, [selected]);

  // Auto scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: "smooth",
    });
  }, [messages]);

  // Send message
  const sendMessage = (e) => {
    e.preventDefault();

    const text = content.trim();

    if (!text) {
      setError("Empty messages are not allowed");
      return;
    }

    if (text.length > 500) {
      setError("Message cannot exceed 500 characters");
      return;
    }

    if (!selected) {
      setError("Please select a classmate");
      return;
    }

    if (!socketRef.current?.connected) {
      setError("Server connection unavailable. Please wait.");
      return;
    }

    setError("");

    socketRef.current.emit(
      "send_message",
      {
        receiverId: selected._id,
        content: text,
      },
      (response) => {
        if (response?.success) {
          setMessages((previous) => {
            if (
              previous.some(
                (item) => item._id === response.data._id
              )
            ) {
              return previous;
            }

            return [...previous, response.data];
          });

          setContent("");
        } else {
          setError(
            response?.message || "Message sending failed"
          );
        }
      }
    );
  };

  // Logout
  const logout = () => {
    socketRef.current?.disconnect();
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/");
  };

  if (!user) return null;

  return (
    <div className="dashboard">
      <header className="topbar">
        <div>
          <h2>Campus Messenger</h2>
          <span>Welcome, {user.name}</span>
          <span>
            {" "}
            · {connected ? "Online" : "Connecting..."}
          </span>
        </div>

        <button onClick={logout} className="logout-btn">
          Logout
        </button>
      </header>

      <main className="chat-layout">
        <aside className="sidebar">
          <h3>Classmates</h3>

          {loading && <p>Loading classmates...</p>}

          {!loading && classmates.length === 0 && (
            <p>No classmates registered yet.</p>
          )}

          {classmates.map((person) => (
            <button
              key={person._id}
              className={`classmate ${
                selected?._id === person._id ? "selected" : ""
              }`}
              onClick={() => {
                setError("");
                setSelected(person);
              }}
            >
              <div className="avatar">
                {person.name.charAt(0).toUpperCase()}
              </div>

              <div>
                <strong>{person.name}</strong>
                <small>{person.email}</small>
              </div>
            </button>
          ))}
        </aside>

        <section className="chat-section">
          {selected ? (
            <>
              <div className="chat-header">
                <div className="avatar">
                  {selected.name.charAt(0).toUpperCase()}
                </div>

                <div>
                  <strong>{selected.name}</strong>
                  <small>Campus Messenger</small>
                </div>
              </div>

              <div className="messages">
                {messages.map((message) => {
                  const senderId =
                    message.sender?._id || message.sender;

                  const isMine =
                    String(senderId) === String(userId);

                  return (
                    <div
                      key={message._id}
                      className={`message ${
                        isMine ? "mine" : "theirs"
                      }`}
                    >
                      <p>{message.content}</p>

                      <small>
                        {new Date(
                          message.createdAt
                        ).toLocaleTimeString()}
                        {isMine && ` · ${message.status}`}
                      </small>
                    </div>
                  );
                })}

                <div ref={bottomRef} />
              </div>

              <div className="validation-note">
                DFA Message Validation · Maximum 500 characters
              </div>

              <form
                className="message-form"
                onSubmit={sendMessage}
              >
                <input
                  type="text"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Type your message..."
                  maxLength={500}
                />

                <button type="submit">Send</button>
              </form>
            </>
          ) : (
            <div className="empty-chat">
              <h2>Welcome to Campus Messenger</h2>
              <p>Select a classmate to start chatting.</p>
            </div>
          )}

          {error && (
            <p className="error-message">{error}</p>
          )}
        </section>
      </main>
    </div>
  );
}

export default ChatPage;
