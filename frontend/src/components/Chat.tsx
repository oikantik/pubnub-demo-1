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
  const [currentChannel, setCurrentChannel] = useState<string | null>(null);
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
          if (channelList.length > 0 && !currentChannel) {
            setCurrentChannel(channelList[0].name);
          }
        }
      } catch (error) {
        console.error("Failed to fetch channels:", error);
      }
    };

    if (authToken) {
      fetchChannels();
    }
  }, [authToken, currentChannel]);

  // Subscribe to the channel
  const subscribeToChannel = useCallback(() => {
    if (!isSubscribed && currentChannel) {
      pubnub.subscribe({
        channels: [currentChannel, TOKEN_UPDATES],
      });
      setIsSubscribed(true);
    }
  }, [pubnub, currentChannel, isSubscribed]);

  // Setup PubNub listeners
  const setupListeners = useCallback(() => {
    const listener = {
      message: (event: any) => {
        // Handle regular messages
        if (event.channel === currentChannel) {
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
          channels: [currentChannel || "", TOKEN_UPDATES],
        });
        setIsSubscribed(false);
      }
    };
  }, [pubnub, currentChannel, isSubscribed]);

  // Setup subscriptions and listeners when PubNub is ready
  useEffect(() => {
    if (pubnub && pubnub.getUUID() && currentChannel) {
      subscribeToChannel();
      const cleanup = setupListeners();

      const fetchHistory = async () => {
        try {
          const response = await fetch(
            `${API_URL}/v1/${currentChannel}/history`,
            {
              headers: {
                Authorization: `Bearer ${authToken}`,
              },
            }
          );

          if (response.ok) {
            const history = await response.json();
            setMessages(history);
          } else {
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
  }, [pubnub, subscribeToChannel, setupListeners, currentChannel, authToken]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input || !currentChannel) return;

    try {
      await fetch(`${API_URL}/v1/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          channel_id: currentChannel,
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
        setCurrentChannel(channel.name);
        setNewChannelName("");
      }
    } catch (error) {
      console.error("Failed to create channel:", error);
    }
  };

  const handleChannelSelect = (channelName: string) => {
    if (channelName === currentChannel) return;

    // Unsubscribe from current channel
    if (isSubscribed && currentChannel) {
      pubnub.unsubscribe({
        channels: [currentChannel],
      });
      setIsSubscribed(false);
    }

    // Set new channel and let the effect handle subscription
    setCurrentChannel(channelName);
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
              className={currentChannel === channel.name ? "active" : ""}
              onClick={() => handleChannelSelect(channel.name)}
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
        <h2>{currentChannel || "Select a channel"}</h2>
        <div className="messages">
          {!currentChannel ? (
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
                <span className="sender">
                  {msg.sender === userId ? "You" : msg.sender}
                </span>
                <p>{msg.message}</p>
                <span className="timestamp">
                  {new Date(msg.timestamp * 1000).toLocaleTimeString()}
                </span>
              </div>
            ))
          )}
        </div>

        {currentChannel && (
          <form onSubmit={handleSubmit} className="message-form">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type a message..."
              disabled={!currentChannel}
            />
            <button type="submit" disabled={!currentChannel}>
              Send
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default Chat;
