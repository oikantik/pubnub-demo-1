import React, { useState, useEffect, useCallback } from "react";
import { usePubNub } from "pubnub-react";
import {
  Container,
  Row,
  Col,
  ListGroup,
  Form,
  Button,
  InputGroup,
  Card,
  Badge,
  FormControl,
  FormLabel,
  FormCheck,
} from "react-bootstrap";
import { FiSend, FiPlus, FiMenu } from "react-icons/fi";

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
    return undefined;
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

  return (
    <Container fluid className="h-100 py-3">
      <Row className="h-100 bg-white shadow rounded overflow-hidden">
        {/* Sidebar */}
        <Col
          xs={12}
          md={4}
          lg={3}
          className="p-0 h-100 border-end"
          style={{ backgroundColor: "#f0f2f5" }}
        >
          {/* Channel Header */}
          <div
            className="d-flex justify-content-between align-items-center p-3"
            style={{ backgroundColor: "#00a884", color: "white" }}
          >
            <h5 className="mb-0">Channels</h5>
            <Form.Check
              type="switch"
              id="channel-toggle"
              label={showAllChannels ? "All Channels" : "My Channels"}
              checked={showAllChannels}
              onChange={() => setShowAllChannels(!showAllChannels)}
              className="text-white"
            />
          </div>

          {/* Channel List */}
          <div
            className="overflow-auto"
            style={{ height: "calc(100% - 130px)" }}
          >
            <ListGroup variant="flush">
              {showAllChannels ? (
                // Show all available channels
                allChannels.length > 0 ? (
                  allChannels.map((channel) => (
                    <ListGroup.Item
                      key={channel.id}
                      className={`d-flex justify-content-between align-items-center ${
                        currentChannelId === channel.id ? "bg-light" : ""
                      }`}
                      style={{ cursor: "pointer" }}
                    >
                      <span className={channel.joined ? "fw-bold" : ""}>
                        {channel.name}
                      </span>
                      {channel.joined ? (
                        <Button
                          variant={
                            currentChannelId === channel.id
                              ? "secondary"
                              : "outline-primary"
                          }
                          size="sm"
                          onClick={() => handleChannelSelect(channel)}
                          disabled={channel.id === currentChannelId}
                          style={{ minWidth: "80px" }}
                        >
                          {channel.id === currentChannelId
                            ? "Current"
                            : "Select"}
                        </Button>
                      ) : (
                        <Button
                          variant="success"
                          size="sm"
                          onClick={() => handleJoinChannel(channel.id)}
                          disabled={isJoining}
                          style={{ minWidth: "80px" }}
                        >
                          {isJoining ? "..." : "Join"}
                        </Button>
                      )}
                    </ListGroup.Item>
                  ))
                ) : (
                  <ListGroup.Item className="text-center text-muted fst-italic">
                    No channels available
                  </ListGroup.Item>
                )
              ) : // Show only user's joined channels
              userChannels.length > 0 ? (
                userChannels.map((channel) => (
                  <ListGroup.Item
                    key={channel.id}
                    active={currentChannelId === channel.id}
                    onClick={() => handleChannelSelect(channel)}
                    className="d-flex align-items-center"
                    style={{ cursor: "pointer" }}
                  >
                    {channel.name}
                  </ListGroup.Item>
                ))
              ) : (
                <ListGroup.Item className="text-center text-muted fst-italic">
                  You haven't joined any channels yet
                </ListGroup.Item>
              )}
            </ListGroup>
          </div>

          {/* Create Channel Form */}
          <div className="p-3 border-top">
            <Form onSubmit={handleCreateChannel}>
              <InputGroup>
                <Form.Control
                  type="text"
                  placeholder="New channel name"
                  value={newChannelName}
                  onChange={(e) => setNewChannelName(e.target.value)}
                />
                <Button
                  variant="primary"
                  type="submit"
                  disabled={!newChannelName.trim()}
                  style={{ backgroundColor: "#00a884", borderColor: "#00a884" }}
                >
                  <FiPlus />
                </Button>
              </InputGroup>
            </Form>
          </div>
        </Col>

        {/* Messages Section */}
        <Col xs={12} md={8} lg={9} className="p-0 d-flex flex-column h-100">
          {/* Message Header */}
          <div className="p-3 bg-light border-bottom d-flex align-items-center">
            <Button
              variant="light"
              className="d-md-none me-2 p-1"
              aria-label="Menu"
            >
              <FiMenu />
            </Button>
            <h5 className="mb-0">{currentChannelName || "Select a channel"}</h5>
          </div>

          {/* Messages Container */}
          <div
            className="flex-grow-1 p-3 overflow-auto"
            style={{
              backgroundImage:
                'url("https://web.whatsapp.com/img/bg-chat-tile-light_686b98c9fdffef3f.png")',
              backgroundRepeat: "repeat",
              backgroundColor: "#efeae2",
            }}
          >
            {!currentChannelId ? (
              <div className="text-center text-muted fst-italic mt-4">
                Please select or create a channel
              </div>
            ) : messages.length === 0 ? (
              <div className="text-center text-muted fst-italic mt-4">
                No messages yet. Be the first to send one!
              </div>
            ) : (
              messages.map((msg, index) => {
                // Check if this message is from the current user
                const isOwnMessage =
                  pubnub.getUUID() === msg.sender || userId === msg.sender;

                return (
                  <div
                    key={msg.id || index}
                    className={`d-flex mb-2 ${
                      isOwnMessage
                        ? "justify-content-end"
                        : "justify-content-start"
                    }`}
                  >
                    <div
                      className={`p-2 rounded shadow-sm ${
                        isOwnMessage ? "bg-success text-white" : "bg-white"
                      }`}
                      style={{
                        maxWidth: "70%",
                        backgroundColor: isOwnMessage ? "#d9fdd3" : "#ffffff",
                        color: "black",
                      }}
                    >
                      <div>{msg.message}</div>
                      <div className="d-flex justify-content-between align-items-center mt-1">
                        <small
                          className="fw-bold"
                          style={{ fontSize: "0.7rem", color: "#8696a0" }}
                        >
                          {msg.sender}
                        </small>
                        <small style={{ fontSize: "0.7rem", color: "#8696a0" }}>
                          {new Date(msg.timestamp * 1000).toLocaleTimeString(
                            [],
                            {
                              hour: "2-digit",
                              minute: "2-digit",
                            }
                          )}
                        </small>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Message Form */}
          {currentChannelId && (
            <div className="p-3 bg-light border-top">
              <Form onSubmit={handleSubmit}>
                <InputGroup>
                  <Form.Control
                    type="text"
                    placeholder="Type a message..."
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    className="rounded-pill me-2"
                  />
                  <Button
                    variant="primary"
                    type="submit"
                    disabled={!input.trim()}
                    className="rounded-circle"
                    style={{
                      backgroundColor: "#00a884",
                      borderColor: "#00a884",
                      width: "40px",
                      height: "40px",
                      padding: "0",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <FiSend />
                  </Button>
                </InputGroup>
              </Form>
            </div>
          )}
        </Col>
      </Row>
    </Container>
  );
};

export default Chat;
