import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "../ui/button";
import { Menu, LogOut } from "lucide-react";
import { ChannelList } from "./ChannelList";
import { CreateChannel } from "./CreateChannel";
import { MessageList } from "./MessageList";
import { MessageInput } from "./MessageInput";
import { API } from "../../lib/api";
import { usePubNubContext } from "../providers/PubNubProvider";
import { useChannels } from "../../hooks/useChannels";
import { useMessages } from "../../hooks/useMessages";
import { Channel } from "../../types";

interface ChatLayoutProps {
  userName: string | null;
  userId: string;
  onLogout: () => void;
}

export function ChatLayout({ userName, userId, onLogout }: ChatLayoutProps) {
  const navigate = useNavigate();
  const { channelId: routeChannelId } = useParams<{ channelId: string }>();
  const { setCurrentUserName, presence, subscribe, unsubscribe } =
    usePubNubContext();

  const [currentChannelId, setCurrentChannelId] = useState<string | null>(null);
  const [currentChannelName, setCurrentChannelName] = useState<string | null>(
    null
  );
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const {
    channels,
    isLoading: channelsLoading,
    refetchChannels,
  } = useChannels();
  const {
    messages,
    isLoading: messagesLoading,
    error: messagesError,
  } = useMessages(currentChannelId);

  const currentChannelData = channels.find((c) => c.id === currentChannelId);

  const handleSelectChannel = useCallback(
    (channelId: string) => {
      const channel = channels.find((c) => c.id === channelId);
      if (channel) {
        setCurrentChannelId(channel.id);
        setCurrentChannelName(channel.name);
      }
    },
    [channels]
  );

  const handleJoinChannel = useCallback(
    async (channel: Channel) => {
      const joiningKey = `joining_${channel.id}`;
      if (sessionStorage.getItem(joiningKey)) return;

      sessionStorage.setItem(joiningKey, "true");
      try {
        await API.joinChannel(channel.id);
        await refetchChannels();
        handleSelectChannel(channel.id);
      } catch (error) {
        console.error("Failed to join channel:", error);
      } finally {
        sessionStorage.removeItem(joiningKey);
      }
    },
    [refetchChannels, handleSelectChannel]
  );

  const handleCreateChannel = useCallback(
    async (name: string) => {
      try {
        const response = await API.createChannel(name);
        await refetchChannels();
        handleSelectChannel(response.data.id);
      } catch (error) {
        console.error("Failed to create channel:", error);
        throw error;
      }
    },
    [refetchChannels, handleSelectChannel]
  );

  const handleSendMessage = useCallback(
    async (message: string) => {
      if (!currentChannelId) return;
      try {
        await API.sendMessage(currentChannelId, message);
      } catch (error) {
        console.error("Failed to send message:", error);
      }
    },
    [currentChannelId]
  );

  useEffect(() => {
    if (routeChannelId) {
      if (routeChannelId !== currentChannelId) {
        handleSelectChannel(routeChannelId);
      }
    } else if (!currentChannelId && channels.length > 0) {
      const firstJoined = channels.find((c) => c.joined === true);
      if (firstJoined) {
        handleSelectChannel(firstJoined.id);
      }
    }
  }, [routeChannelId, channels, currentChannelId, handleSelectChannel]);

  useEffect(() => {
    if (currentChannelId && currentChannelId !== routeChannelId) {
      navigate(`/channel/${currentChannelId}`, { replace: true });
    }
  }, [currentChannelId, routeChannelId, navigate]);

  useEffect(() => {
    if (userName) {
      setCurrentUserName(userName);
    }
  }, [userName, setCurrentUserName]);

  useEffect(() => {
    if (currentChannelId) {
      console.log(`ChatLayout: Subscribing to ${currentChannelId}`);
      subscribe([currentChannelId]);
    }

    return () => {
      if (currentChannelId) {
        console.log(`ChatLayout: Unsubscribing from ${currentChannelId}`);
        unsubscribe([currentChannelId]);
      }
    };
  }, [currentChannelId, subscribe, unsubscribe]);

  return (
    <div className="flex h-screen bg-background">
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-4 left-4 lg:hidden z-10"
        onClick={() => setSidebarOpen(!sidebarOpen)}
      >
        <Menu className="h-5 w-5" />
      </Button>

      <div
        className={`w-64 border-r flex-shrink-0 flex flex-col h-full ${
          sidebarOpen ? "block" : "hidden lg:block"
        }`}
      >
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

        <div className="px-4 py-2 border-b flex-shrink-0">
          <p className="font-medium text-sm">Logged in as:</p>
          <p className="text-primary font-bold">{userName || userId}</p>
        </div>

        <div className="p-2 flex-shrink-0">
          <CreateChannel onCreateChannel={handleCreateChannel} />
        </div>

        <div className="flex flex-col overflow-auto flex-grow">
          {channelsLoading && (
            <div className="p-4 text-center text-muted-foreground">
              Loading channels...
            </div>
          )}
          {!channelsLoading && (
            <ChannelList
              channels={channels}
              currentChannelId={currentChannelId}
              onSelectChannel={handleSelectChannel}
              onJoinChannel={handleJoinChannel}
            />
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col">
        <div className="h-14 border-b flex items-center px-4">
          <div className="flex items-center">
            {currentChannelName ? (
              <>
                <div className="font-bold">{currentChannelName}</div>
                <div className="ml-2 text-xs text-muted-foreground">
                  {presence[currentChannelId || ""] !== undefined &&
                  presence[currentChannelId || ""] >= 0
                    ? `${presence[currentChannelId || ""]} online`
                    : Array.isArray(currentChannelData?.members)
                    ? `${currentChannelData.members.length} members`
                    : "-"}
                </div>
              </>
            ) : (
              <div className="font-bold">Select a channel</div>
            )}
          </div>
        </div>

        {currentChannelId ? (
          <>
            {messagesLoading && (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-muted-foreground">Loading messages...</p>
              </div>
            )}
            {messagesError && (
              <div className="flex-1 flex items-center justify-center p-4">
                <p className="text-destructive">
                  Error loading messages: {messagesError}
                </p>
              </div>
            )}
            {!messagesLoading && !messagesError && (
              <MessageList
                channelId={currentChannelId}
                messages={messages}
                currentUserId={userId}
              />
            )}
            <MessageInput
              channelId={currentChannelId}
              onSendMessage={handleSendMessage}
              disabled={messagesLoading}
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
