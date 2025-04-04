import React, { useState, useEffect, useCallback } from "react";
import { usePubNub } from "pubnub-react";

interface ChatProps {
  userId: string;
  authToken: string;
}

interface Message {
  message: string;
  sender: string;
  timestamp: number;
  channel?: string;
  channel_id?: string;
  id?: string;
}

interface Channel {
  id: string;
  name: string;
}

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:9292";

// Channel for token refresh notifications - must match server
const TOKEN_UPDATES = "token-updates";

const Chat: React.FC<ChatProps> = ({ userId, authToken }) => {
  const pubnub = usePubNub();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [currentChannelId, setCurrentChannelId] = useState<string | null>(null);
  const [currentChannelName, setCurrentChannelName] = useState<string | null>(
    null
  );
  const [channels, setChannels] = useState<Channel[]>([]);
  const [newChannelName, setNewChannelName] = useState("");
  const [isSubscribed, setIsSubscribed] = useState(false);

  // Load user's channels
  useEffect(() => {
    const fetchChannels = async () => {
      try {
        const response = await fetch(`${API_URL}/v1/users/channels`, {
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        });

        if (response.ok) {
          const channelList = await response.json();
          setChannels(channelList);

          // Auto-select first channel if available
          if (channelList.length > 0 && !currentChannelId) {
            setCurrentChannelId(channelList[0].id);
            setCurrentChannelName(channelList[0].name);
          }
        }
      } catch (error) {
        console.error("Failed to fetch channels:", error);
      }
    };

    if (authToken) {
      fetchChannels();
    }
  }, [authToken, currentChannelId]);

  // Subscribe to the channel
  const subscribeToChannel = useCallback(() => {
    if (!isSubscribed && currentChannelId) {
      console.log(`Subscribing to channel: ${currentChannelId}`);
      pubnub.subscribe({
        channels: [currentChannelId, TOKEN_UPDATES],
      });
      setIsSubscribed(true);
    }
  }, [pubnub, currentChannelId, isSubscribed]);

  // Setup PubNub listeners
  const setupListeners = useCallback(() => {
    const listener = {
      message: (event: any) => {
        // Handle regular messages
        if (event.channel === currentChannelId) {
          const message = event.message as Message;
          setMessages((messages) => [...messages, message]);
        }

        // Handle token refresh notifications
        if (event.channel === TOKEN_UPDATES) {
          const data = event.message;
          if (
            data.event === "token_refresh" &&
            data.user_id === pubnub.getUUID()
          ) {
            console.log(
              "Token refresh notification received in Chat component"
            );
            // The PubNubProvider component will handle the actual token refresh
          }
        }
      },
    };

    pubnub.addListener(listener);

    return () => {
      pubnub.removeListener(listener);
      if (isSubscribed) {
        pubnub.unsubscribe({
          channels: [currentChannelId || "", TOKEN_UPDATES],
        });
        setIsSubscribed(false);
      }
    };
  }, [pubnub, currentChannelId, isSubscribed]);

  // Setup subscriptions and listeners when PubNub is ready
  useEffect(() => {
    if (pubnub && pubnub.getUUID() && currentChannelId) {
      subscribeToChannel();
      const cleanup = setupListeners();

      const fetchHistory = async () => {
        try {
          console.log(`Fetching history for channel ID: ${currentChannelId}`);
          const response = await fetch(
            `${API_URL}/v1/channels/${currentChannelId}/history`,
            {
              headers: {
                Authorization: `Bearer ${authToken}`,
              },
            }
          );

          if (response.ok) {
            const history = await response.json();
            console.log(`Received ${history.length} messages from history`);
            setMessages(history);
          } else {
            console.error(
              `Error fetching history: ${response.status} ${response.statusText}`
            );
            setMessages([]);
          }
        } catch (error) {
          console.error("Failed to fetch message history:", error);
          setMessages([]);
        }
      };

      fetchHistory();

      return cleanup;
    }
  }, [pubnub, subscribeToChannel, setupListeners, currentChannelId, authToken]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input || !currentChannelId) return;

    try {
      console.log(`Sending message to channel ID: ${currentChannelId}`);
      await fetch(`${API_URL}/v1/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          channel_id: currentChannelId,
          text: input,
        }),
      });

      setInput("");
    } catch (error) {
      console.error("Failed to send message:", error);
    }
  };

  const handleCreateChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChannelName.trim()) return;

    try {
      const response = await fetch(`${API_URL}/v1/users/channels`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          name: newChannelName,
        }),
      });

      if (response.ok) {
        const channel = await response.json();
        setChannels([...channels, channel]);
        setCurrentChannelId(channel.id);
        setCurrentChannelName(channel.name);
        setNewChannelName("");
      }
    } catch (error) {
      console.error("Failed to create channel:", error);
    }
  };

  const handleChannelSelect = (channel: Channel) => {
    if (channel.id === currentChannelId) return;

    // Unsubscribe from current channel
    if (isSubscribed && currentChannelId) {
      pubnub.unsubscribe({
        channels: [currentChannelId],
      });
      setIsSubscribed(false);
    }

    // Set new channel and let the effect handle subscription
    setCurrentChannelId(channel.id);
    setCurrentChannelName(channel.name);
    setMessages([]);
  };

  return (
    <div className="chat-container">
      <div className="sidebar">
        <h3>Channels</h3>
        <ul className="channel-list">
          {channels.map((channel) => (
            <li
              key={channel.id}
              className={currentChannelId === channel.id ? "active" : ""}
              onClick={() => handleChannelSelect(channel)}
            >
              {channel.name}
            </li>
          ))}
        </ul>
        <form onSubmit={handleCreateChannel} className="create-channel-form">
          <input
            type="text"
            value={newChannelName}
            onChange={(e) => setNewChannelName(e.target.value)}
            placeholder="New channel name"
          />
          <button type="submit">Create</button>
        </form>
      </div>

      <div className="messages-section">
        <h2>{currentChannelName || "Select a channel"}</h2>
        <div className="messages">
          {!currentChannelId ? (
            <p className="no-channel">Please select or create a channel</p>
          ) : messages.length === 0 ? (
            <p className="no-messages">
              No messages yet. Be the first to send one!
            </p>
          ) : (
            messages.map((msg, index) => (
              <div
                key={msg.id || index}
                className={`message ${
                  msg.sender === userId ? "sent" : "received"
                }`}
              >
                <div className="message-content">
                  <p>{msg.message}</p>
                  <div className="message-meta">
                    <span className="sender">{msg.sender}</span>
                    <span className="timestamp">
                      {new Date(msg.timestamp * 1000).toLocaleTimeString()}
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
        {currentChannelId && (
          <form onSubmit={handleSubmit} className="message-form">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type a message..."
            />
            <button type="submit">Send</button>
          </form>
        )}
      </div>
    </div>
  );
};

export default Chat;
