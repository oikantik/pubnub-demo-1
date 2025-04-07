import { useEffect, useState } from "react";
import { Button } from "../ui/button";
import { Menu, LogOut, Users } from "lucide-react";
import { ChannelList } from "./ChannelList";
import { CreateChannel } from "./CreateChannel";
import { MessageList } from "./MessageList";
import { MessageInput } from "./MessageInput";
import { API } from "../../lib/api";
import pubnubClient from "../../lib/pubnub-client";
import { usePubNubContext } from "../providers/PubNubProvider";

interface Channel {
  id: string;
  name: string;
  joined?: boolean;
}

interface Message {
  id?: string;
  sender: string;
  content: string;
  timestamp: number;
  type?: string;
}

interface ChatLayoutProps {
  userId: string;
  onLogout: () => void;
}

export function ChatLayout({ userId, onLogout }: ChatLayoutProps) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [allChannels, setAllChannels] = useState<Channel[]>([]);
  const [currentChannelId, setCurrentChannelId] = useState<string | null>(null);
  const [currentChannelName, setCurrentChannelName] = useState<string | null>(
    null
  );
  const [messages, setMessages] = useState<Message[]>([]);
  const [showAllChannels, setShowAllChannels] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { presence } = usePubNubContext();

  // Fetch user channels
  const fetchUserChannels = async () => {
    try {
      const response = await API.getUserChannels();
      // Only set channels with joined=true from the response
      const userChannels = response.data
        .filter((channel: any) => channel.joined === true)
        .map((channel: any) => ({
          ...channel,
          joined: true,
        }));
      setChannels(userChannels);

      // Auto-select the first channel if none is selected
      if (userChannels.length > 0 && !currentChannelId) {
        handleSelectChannel(userChannels[0].id);
      }
    } catch (error) {
      console.error("Failed to fetch user channels:", error);
    }
  };

  // Fetch all available channels
  const fetchAllChannels = async () => {
    try {
      const response = await API.getAllChannels();
      const allChannelsList = response.data;

      // Mark joined channels
      const joinedChannelIds = channels.map((c) => c.id);
      const markedChannels = allChannelsList.map((channel: any) => ({
        ...channel,
        joined: joinedChannelIds.includes(channel.id),
      }));

      setAllChannels(markedChannels);
    } catch (error) {
      console.error("Failed to fetch all channels:", error);
    }
  };

  // Fetch initial data
  useEffect(() => {
    fetchUserChannels();
    fetchAllChannels();
  }, []);

  // Subscribe to channel when current channel changes
  useEffect(() => {
    if (!currentChannelId) return;

    // Find the selected channel
    const selectedChannel = [...channels, ...allChannels].find(
      (c) => c.id === currentChannelId
    );

    // Only proceed if the selected channel exists and user has joined it
    if (!selectedChannel || selectedChannel.joined !== true) {
      console.log("Cannot load messages for unjoined channel");
      setMessages([]);
      return;
    }

    // Unsubscribe from previous channels and subscribe to new one
    const subscribedChannels = channels.map((c) => c.id);
    pubnubClient.subscribe([currentChannelId]);

    // Fetch message history
    const fetchMessages = async () => {
      try {
        const response = await API.getChannelMessages(currentChannelId);

        // Transform messages to match our format
        const formattedMessages = response.data.map((msg: any) => ({
          id: msg.id,
          sender: msg.sender_id || msg.sender,
          content: msg.text || msg.message,
          timestamp: msg.timestamp,
        }));

        setMessages(formattedMessages);
      } catch (error) {
        console.error("Failed to fetch messages:", error);
        setMessages([]);
      }
    };

    fetchMessages();

    // Set up listeners
    pubnubClient.setupListeners({
      onMessage: (_, messageEvent) => {
        const { type, content, sender, timestamp } = messageEvent;

        if (type === "message") {
          setMessages((prev) => [
            ...prev,
            {
              id: `${sender}-${timestamp}`,
              sender,
              content,
              timestamp,
            },
          ]);
        }
      },
    });

    return () => {
      pubnubClient.unsubscribe(subscribedChannels);
    };
  }, [currentChannelId, channels]);

  // Handle channel selection
  const handleSelectChannel = (channelId: string) => {
    // Find the channel
    const channel = [...channels, ...allChannels].find(
      (c) => c.id === channelId
    );

    // Only allow selecting joined channels
    if (channel && channel.joined === true) {
      setCurrentChannelId(channelId);
      setCurrentChannelName(channel.name);
    } else {
      console.log("Cannot select unjoined channel");
    }
  };

  // Handle joining a channel
  const handleJoinChannel = async (channel: Channel) => {
    try {
      await API.joinChannel(channel.id);

      // After joining, refresh user channels and select the joined channel
      await fetchUserChannels();
      await fetchAllChannels();

      // Select the joined channel
      handleSelectChannel(channel.id);

      // Switch back to user channels
      setShowAllChannels(false);
    } catch (error) {
      console.error("Failed to join channel:", error);
    }
  };

  // Handle creating a channel
  const handleCreateChannel = async (name: string) => {
    try {
      const response = await API.createChannel(name);
      console.log("Channel created:", response.data);

      // Refresh channels after creation
      await fetchUserChannels();
      await fetchAllChannels();

      // Switch to My Channels view after creation
      setShowAllChannels(false);
    } catch (error) {
      console.error("Failed to create channel:", error);
      throw error;
    }
  };

  // Handle sending a message
  const handleSendMessage = async (message: string) => {
    if (!currentChannelId) return;

    try {
      await API.sendMessage(currentChannelId, message);
      // Message will be added to the list via PubNub subscription
    } catch (error) {
      console.error("Failed to send message:", error);
    }
  };

  return (
    <div className="flex h-screen bg-background">
      {/* Mobile sidebar toggle */}
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-4 left-4 lg:hidden z-10"
        onClick={() => setSidebarOpen(!sidebarOpen)}
      >
        <Menu className="h-5 w-5" />
      </Button>

      {/* Sidebar */}
      <div
        className={`w-64 border-r flex-shrink-0 flex flex-col ${
          sidebarOpen ? "block" : "hidden lg:block"
        }`}
      >
        {/* Sidebar header */}
        <div className="h-14 border-b flex items-center justify-between px-4">
          <div className="font-semibold">Chat App</div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              title="Toggle channel view"
              onClick={() => setShowAllChannels(!showAllChannels)}
            >
              <Users className="h-5 w-5" />
            </Button>

            <Button
              variant="ghost"
              size="icon"
              onClick={onLogout}
              title="Logout"
            >
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* User info */}
        <div className="px-4 py-2 border-b">
          <p className="font-medium text-sm">Logged in as:</p>
          <p className="text-primary font-bold">{userId}</p>
        </div>

        {/* Create channel button */}
        <div className="p-2">
          <CreateChannel onCreateChannel={handleCreateChannel} />
        </div>

        {/* Channel tabs */}
        <div className="px-2 py-1 flex text-sm border-b">
          <Button
            variant={!showAllChannels ? "default" : "ghost"}
            className="flex-1 h-8 text-xs"
            onClick={() => setShowAllChannels(false)}
          >
            My Channels
          </Button>
          <Button
            variant={showAllChannels ? "default" : "ghost"}
            className="flex-1 h-8 text-xs"
            onClick={() => setShowAllChannels(true)}
          >
            All Channels
          </Button>
        </div>

        {/* Channel list */}
        <div className="flex-1 overflow-y-auto">
          <ChannelList
            channels={showAllChannels ? allChannels : channels}
            currentChannelId={currentChannelId}
            onSelectChannel={handleSelectChannel}
            onJoinChannel={showAllChannels ? handleJoinChannel : undefined}
          />
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col">
        {/* Channel header */}
        <div className="h-14 border-b flex items-center px-4">
          <div className="flex items-center">
            {currentChannelName && (
              <>
                <div className="font-bold">{currentChannelName}</div>
                <div className="ml-2 text-xs text-muted-foreground">
                  {presence[currentChannelId || ""] || 0} online
                </div>
              </>
            )}
          </div>
        </div>

        {/* Messages or placeholder */}
        {currentChannelId ? (
          <>
            <MessageList
              channelId={currentChannelId}
              messages={messages}
              currentUserId={userId}
            />
            <MessageInput
              channelId={currentChannelId}
              onSendMessage={handleSendMessage}
            />
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <h3 className="text-lg font-medium">Welcome to Chat App</h3>
              <p className="text-muted-foreground mt-1">
                Select a channel to start chatting or create a new one
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
