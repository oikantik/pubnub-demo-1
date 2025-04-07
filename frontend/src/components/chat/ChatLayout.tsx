import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "../ui/button";
import { Menu, LogOut } from "lucide-react";
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
  sender_id: string;
  content: string;
  timestamp: number;
  type?: string;
}

interface ChatLayoutProps {
  userName: string | null;
  userId: string;
  onLogout: () => void;
}

export function ChatLayout({ userName, userId, onLogout }: ChatLayoutProps) {
  const navigate = useNavigate();
  const { channelId: routeChannelId } = useParams<{ channelId: string }>();

  const [channels, setChannels] = useState<Channel[]>([]);
  const [currentChannelId, setCurrentChannelId] = useState<string | null>(null);
  const [currentChannelName, setCurrentChannelName] = useState<string | null>(
    null
  );
  const [messages, setMessages] = useState<Message[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { presence } = usePubNubContext();

  // Handle routing to a specific channel
  useEffect(() => {
    if (routeChannelId) {
      // If we have a channel ID in the route, set it as the current channel
      setCurrentChannelId(routeChannelId);

      // Find channel name if channels are already loaded
      const foundChannel = channels.find((c) => c.id === routeChannelId);
      if (foundChannel) {
        setCurrentChannelName(foundChannel.name);
      }
    }
  }, [routeChannelId, channels]);

  // Fetch channels and merge them into a single list
  const fetchChannels = async () => {
    try {
      // Fetch user joined channels
      const userChannelsResponse = await API.getUserChannels();
      const userChannels = userChannelsResponse.data.map((channel: any) => ({
        ...channel,
        joined: true,
      }));

      // Fetch all available channels
      const allChannelsResponse = await API.getAllChannels();
      const allChannels = allChannelsResponse.data;

      setChannels(allChannels);

      // Auto-select the first joined channel if none is selected
      if (userChannels.length > 0 && !currentChannelId && !routeChannelId) {
        handleSelectChannel(userChannels[0].id);
      }

      // If we have a channel ID in the route, set the channel name
      if (routeChannelId) {
        const foundChannel = allChannels.find(
          (c: Channel) => c.id === routeChannelId
        );
        if (foundChannel) {
          setCurrentChannelName(foundChannel.name);
        }
      }
    } catch (error) {
      console.error("Failed to fetch channels:", error);
    }
  };

  // Fetch initial data
  useEffect(() => {
    fetchChannels();
  }, []);

  // Set up message listeners for current channel
  useEffect(() => {
    if (!currentChannelId) return;

    // Find the selected channel
    const selectedChannel = channels.find((c) => c.id === currentChannelId);

    // Only proceed if the selected channel exists and user has joined it
    if (!selectedChannel || selectedChannel.joined !== true) {
      // If coming from a route, try to join the channel automatically
      if (routeChannelId === currentChannelId && selectedChannel) {
        handleJoinChannel(selectedChannel);
        return;
      }

      console.log("Cannot load messages for unjoined channel");
      setMessages([]);
      return;
    }

    // Update the URL to reflect the current channel
    navigate(`/channel/${currentChannelId}`, { replace: true });

    // Fetch message history
    const fetchMessages = async () => {
      try {
        const response = await API.getChannelMessages(currentChannelId);

        // Transform messages to match our format
        const formattedMessages = response.data.map((msg: any) => ({
          id: msg.id,
          sender: msg.sender,
          sender_id: msg.sender_id,
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
        const { type, content, sender, sender_id, timestamp } = messageEvent;

        if (type === "message") {
          setMessages((prev) => [
            ...prev,
            {
              id: `${sender}-${timestamp}`,
              sender,
              sender_id: sender_id,
              content,
              timestamp,
            },
          ]);
        }
      },
    });

    // No need to manually subscribe/unsubscribe as the token has the necessary permissions
  }, [currentChannelId, channels]);

  // Handle channel selection
  const handleSelectChannel = (channelId: string) => {
    // Find the channel
    const channel = channels.find((c) => c.id === channelId);

    setCurrentChannelId(channelId);
    if (channel) {
      setCurrentChannelName(channel.name);

      // If it's a joined channel, navigate to it
      if (channel.joined === true) {
        navigate(`/channel/${channelId}`);
      }
    }
  };

  // Handle joining a channel
  const handleJoinChannel = async (channel: Channel) => {
    try {
      await API.joinChannel(channel.id);

      // After joining, refresh channels
      await fetchChannels();

      // Select the joined channel
      handleSelectChannel(channel.id);
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
      await fetchChannels();

      // Select the newly created channel if available
      if (response.data && response.data.id) {
        handleSelectChannel(response.data.id);
      }
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
        className={`w-64 border-r flex-shrink-0 flex flex-col h-full ${
          sidebarOpen ? "block" : "hidden lg:block"
        }`}
      >
        {/* Sidebar header */}
        <div className="h-14 border-b flex items-center justify-between px-4 flex-shrink-0">
          <div className="font-semibold">Chat App</div>
          <div className="flex items-center gap-2">
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
        <div className="px-4 py-2 border-b flex-shrink-0">
          <p className="font-medium text-sm">Logged in as:</p>
          <p className="text-primary font-bold">{userName || userId}</p>
        </div>

        {/* Create channel button */}
        <div className="p-2 flex-shrink-0">
          <CreateChannel onCreateChannel={handleCreateChannel} />
        </div>

        {/* Channels container with all channels in one list component */}
        <div className="flex flex-col overflow-auto flex-grow">
          <ChannelList
            channels={channels}
            currentChannelId={currentChannelId}
            onSelectChannel={handleSelectChannel}
            onJoinChannel={handleJoinChannel}
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
