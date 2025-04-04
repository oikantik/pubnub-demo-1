import React, { useState, useEffect } from "react";
import { usePubNub } from "pubnub-react";

interface Message {
  message: string;
  sender: string;
  timestamp: number;
  channel?: string;
  id?: string;
}

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:9292";

const Chat: React.FC = () => {
  const pubnub = usePubNub();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [channel] = useState("demo-channel");

  useEffect(() => {
    pubnub.subscribe({ channels: [channel] });

    pubnub.addListener({
      message: (event) => {
        const message = event.message as Message;
        setMessages((messages) => [...messages, message]);
      },
    });

    const fetchHistory = async () => {
      try {
        const response = await fetch(`${API_URL}/messages/${channel}/history`);
        const history = await response.json();
        setMessages(history);
      } catch (error) {
        console.error("Failed to fetch message history:", error);
      }
    };

    fetchHistory();

    return () => {
      pubnub.unsubscribe({ channels: [channel] });
    };
  }, [pubnub, channel]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input) return;

    try {
      await fetch(`${API_URL}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          channel,
          message: input,
          sender: pubnub.getUUID(),
        }),
      });

      setInput("");
    } catch (error) {
      console.error("Failed to send message:", error);
    }
  };

  return (
    <div className="chat-container">
      <h2>PubNub Real-time Chat</h2>
      <div className="messages">
        {messages.length === 0 ? (
          <p className="no-messages">
            No messages yet. Be the first to send one!
          </p>
        ) : (
          messages.map((msg, index) => (
            <div
              key={msg.id || index}
              className={`message ${
                msg.sender === pubnub.getUUID() ? "sent" : "received"
              }`}
            >
              <span className="sender">
                {msg.sender === pubnub.getUUID() ? "You" : msg.sender}
              </span>
              <p>{msg.message}</p>
              <span className="timestamp">
                {new Date(msg.timestamp * 1000).toLocaleTimeString()}
              </span>
            </div>
          ))
        )}
      </div>
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message..."
        />
        <button type="submit">Send</button>
      </form>
    </div>
  );
};

export default Chat;
