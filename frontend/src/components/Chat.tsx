import React, { useState, useEffect, useCallback } from "react";
import { usePubNub } from "pubnub-react";
import "./Chat.css";

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
  joined?: boolean;
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
  const [userChannels, setUserChannels] = useState<Channel[]>([]);
  const [allChannels, setAllChannels] = useState<Channel[]>([]);
  const [newChannelName, setNewChannelName] = useState("");
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [showAllChannels, setShowAllChannels] = useState(false);
  const [isJoining, setIsJoining] = useState(false);

  // Load all available channels
  const fetchAllChannels = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/v1/channels`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      if (response.ok) {
        const channelList = await response.json();
        console.log("All channels:", channelList);
        setAllChannels(channelList);
      }
    } catch (error) {
      console.error("Failed to fetch all channels:", error);
    }
  }, [authToken]);

  // Load user's joined channels
  const fetchUserChannels = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/v1/users/channels`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      if (response.ok) {
        const channelList = await response.json();
        console.log("User channels:", channelList);
        setUserChannels(channelList);

        // Auto-select first channel if available
        if (channelList.length > 0 && !currentChannelId) {
          setCurrentChannelId(channelList[0].id);
          setCurrentChannelName(channelList[0].name);
        }
      }
    } catch (error) {
      console.error("Failed to fetch user channels:", error);
    }
  }, [authToken, currentChannelId]);

  // Fetch both channel lists on initial load
  useEffect(() => {
    if (authToken) {
      fetchUserChannels();
      fetchAllChannels();
    }
  }, [authToken, fetchUserChannels, fetchAllChannels]);

  // Subscribe to the channel
  const subscribeToChannel = useCallback(() => {
    if (currentChannelId) {
      console.log(`Subscribing to channel: ${currentChannelId}`);

      // Always unsubscribe from all channels first
      console.log("Unsubscribing from all channels");
      pubnub.unsubscribe({
        channels: [currentChannelId, TOKEN_UPDATES],
      });

      // Subscribe to new channel - using both ID and name to ensure messages are received
      // Since the API publishes to channel name but our frontend uses IDs
      const channelsToSubscribe = [
        currentChannelId,
        ...(currentChannelName ? [currentChannelName] : []),
        TOKEN_UPDATES,
      ];
      console.log(`Subscribing to channels: ${channelsToSubscribe.join(", ")}`);

      pubnub.subscribe({
        channels: channelsToSubscribe,
        withPresence: true,
      });

      setIsSubscribed(true);
    }
  }, [pubnub, currentChannelId, currentChannelName]);

  // Setup PubNub listeners
  const setupListeners = useCallback(() => {
    // Create a new empty listener
    const listener = {
      message: (event: any) => {
        console.log("PubNub message received:", event);

        // Check if this is a message for our current channel
        // Match by either channel ID or channel name
        const eventChannel = event.channel;
        const isForCurrentChannel =
          eventChannel === currentChannelId ||
          eventChannel === currentChannelName;

        if (isForCurrentChannel) {
          console.log("Message received for current channel:", event.message);

          // Check what format the message is in
          const messageData = event.message;
          let newMessage: Message;

          if (messageData.event === "new_message") {
            // Server-formatted message
            newMessage = {
              message: messageData.message,
              sender: messageData.sender,
              timestamp: messageData.timestamp,
              channel: messageData.channel,
              channel_id:
                messageData.channel_id || currentChannelId || undefined,
              id: messageData.id,
            };
          } else if (typeof messageData === "object" && messageData.message) {
            // Already in Message format
            newMessage = messageData as Message;
          } else {
            // Raw message format, create our own
            newMessage = {
              message:
                typeof messageData === "string"
                  ? messageData
                  : JSON.stringify(messageData),
              sender: "System",
              timestamp: Math.floor(Date.now() / 1000),
              channel: currentChannelName || undefined,
              channel_id: currentChannelId || undefined,
              id: `temp-${Date.now()}`,
            };
          }

          // Only add message if not already in the list
          setMessages((prevMessages) => {
            // Check for duplicates by ID or content+timestamp combo
            const isDuplicate = prevMessages.some(
              (m) =>
                (m.id && m.id === newMessage.id) ||
                (m.message === newMessage.message &&
                  m.sender === newMessage.sender &&
                  Math.abs(m.timestamp - newMessage.timestamp) < 5) // Within 5 seconds
            );

            if (isDuplicate) {
              console.log("Message already exists, not adding again");
              return prevMessages;
            }
            console.log("Adding new message to state:", newMessage);
            return [...prevMessages, newMessage];
          });
        } else if (event.channel === TOKEN_UPDATES) {
          // Handle token refresh notifications
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
      status: (statusEvent: any) => {
        console.log("PubNub status event:", statusEvent);

        // Re-subscribe if we get disconnected
        if (
          statusEvent.category === "PNNetworkDownCategory" &&
          currentChannelId
        ) {
          setTimeout(() => {
            console.log("Network down, attempting to resubscribe");
            subscribeToChannel();
          }, 5000);
        }
      },
      presence: (presenceEvent: any) => {
        console.log("PubNub presence event:", presenceEvent);
      },
    };

    // Add the listener
    pubnub.addListener(listener);
    console.log("Added PubNub listener");

    return () => {
      console.log("Removing PubNub listener");
      pubnub.removeListener(listener);
      if (isSubscribed) {
        pubnub.unsubscribe({
          channels: [
            currentChannelId || "",
            ...(currentChannelName ? [currentChannelName] : []),
            TOKEN_UPDATES,
          ],
        });
        setIsSubscribed(false);
      }
    };
  }, [
    pubnub,
    currentChannelId,
    isSubscribed,
    currentChannelName,
    subscribeToChannel,
  ]);

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
      const response = await fetch(`${API_URL}/v1/messages`, {
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

      if (response.ok) {
        const messageData = await response.json();
        console.log("Message sent successfully:", messageData);

        // We don't need to add message to local state immediately anymore
        // The PubNub listener will receive the message back from the server
        // This avoids duplicate messages
      }

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
        setNewChannelName("");

        // Refresh channel lists
        fetchUserChannels();
        fetchAllChannels();

        // Select the newly created channel
        setCurrentChannelId(channel.id);
        setCurrentChannelName(channel.name);
      }
    } catch (error) {
      console.error("Failed to create channel:", error);
    }
  };

  const handleJoinChannel = async (channelId: string) => {
    if (isJoining) return; // Prevent multiple clicks

    setIsJoining(true);
    try {
      const response = await fetch(`${API_URL}/v1/channels/${channelId}/join`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
      });

      if (response.ok) {
        // Refresh channel lists
        await fetchUserChannels();
        await fetchAllChannels();

        // Auto-select the joined channel
        const joinedChannelData = await response.json();
        if (!joinedChannelData.already_member) {
          setCurrentChannelId(channelId);
          const channelName =
            allChannels.find((c) => c.id === channelId)?.name || "Channel";
          setCurrentChannelName(channelName);
        }
      }
    } catch (error) {
      console.error("Failed to join channel:", error);
    } finally {
      setIsJoining(false);
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

  const toggleChannelView = () => {
    setShowAllChannels(!showAllChannels);
  };

  return (
    <div className="chat-container">
      <div className="sidebar">
        <div className="channels-header">
          <h3>Channels</h3>
          <button className="toggle-channels-btn" onClick={toggleChannelView}>
            {showAllChannels ? "Show My Channels" : "Show All Channels"}
          </button>
        </div>

        <ul className="channel-list">
          {showAllChannels ? (
            // Show all available channels
            allChannels.length > 0 ? (
              allChannels.map((channel) => (
                <li
                  key={channel.id}
                  className={`channel-item ${
                    channel.id === currentChannelId ? "active" : ""
                  }`}
                >
                  <span
                    className={
                      channel.joined ? "channel-name joined" : "channel-name"
                    }
                  >
                    {channel.name}
                  </span>
                  {channel.joined ? (
                    <button
                      className="channel-action-btn select-btn"
                      onClick={() => handleChannelSelect(channel)}
                      disabled={channel.id === currentChannelId}
                    >
                      {channel.id === currentChannelId ? "Current" : "Select"}
                    </button>
                  ) : (
                    <button
                      className="channel-action-btn join-btn"
                      onClick={() => handleJoinChannel(channel.id)}
                      disabled={isJoining}
                    >
                      {isJoining ? "Joining..." : "Join"}
                    </button>
                  )}
                </li>
              ))
            ) : (
              <li className="no-channels">No channels available</li>
            )
          ) : // Show only user's joined channels
          userChannels.length > 0 ? (
            userChannels.map((channel) => (
              <li
                key={channel.id}
                className={currentChannelId === channel.id ? "active" : ""}
                onClick={() => handleChannelSelect(channel)}
              >
                {channel.name}
              </li>
            ))
          ) : (
            <li className="no-channels">You haven't joined any channels yet</li>
          )}
        </ul>

        <form onSubmit={handleCreateChannel} className="create-channel-form">
          <input
            type="text"
            value={newChannelName}
            onChange={(e) => setNewChannelName(e.target.value)}
            placeholder="New channel name"
          />
          <button type="submit">Create Channel</button>
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
            messages.map((msg, index) => {
              // Check if this message is from the current user
              const isOwnMessage =
                pubnub.getUUID() === msg.sender || userId === msg.sender;
              return (
                <div
                  key={msg.id || index}
                  className={`message ${isOwnMessage ? "sent" : "received"}`}
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
              );
            })
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
