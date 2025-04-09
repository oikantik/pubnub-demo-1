import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from "react";
import { PubNubProvider as Provider } from "pubnub-react";
import PubNub, { MessageEvent } from "pubnub";
import pubnubService from "../../lib/pubnub.service";
import { TypingUser, Message } from "../../types";

// Define the PubNub context interface
interface PubNubContextType {
  client: PubNub | null;
  isInitialized: boolean;
  isConnected: boolean;
  typingUsers: Record<string, TypingUser[]>;
  startTyping: (channel: string) => void;
  stopTyping: (channel: string) => void;
  presence: Record<string, number>;
  subscribe: (channels: string[]) => void;
  unsubscribe: (channels: string[]) => void;
  currentUserName: string | null;
  setCurrentUserName: (name: string) => void;
  userId: string | null;
  messagesByChannel: Record<string, Message[]>;
  getMessagesForChannel: (channelId: string) => Message[];
}

// Create context with default values
const PubNubContext = createContext<PubNubContextType>({
  client: null,
  isInitialized: false,
  isConnected: false,
  typingUsers: {},
  startTyping: () => {},
  stopTyping: () => {},
  presence: {},
  subscribe: () => {},
  unsubscribe: () => {},
  currentUserName: null,
  setCurrentUserName: () => {},
  userId: null,
  messagesByChannel: {},
  getMessagesForChannel: () => [],
});

/**
 * Custom hook for accessing PubNub context
 */
export const usePubNub = () => {
  const context = useContext(PubNubContext);
  if (!context) {
    throw new Error("usePubNub must be used within a PubNubProvider");
  }
  return context;
};

export const usePubNubContext = usePubNub; // Keep existing export for backward compatibility

interface PubNubProviderProps {
  children: React.ReactNode;
  userId?: string;
}

export const PubNubProvider: React.FC<PubNubProviderProps> = ({
  children,
  userId,
}) => {
  const [clientInstance, setClientInstance] = useState<PubNub | null>(
    pubnubService.client
  );
  const [isInitialized, setIsInitialized] = useState(pubnubService.initialized);
  const [isConnected, setIsConnected] = useState(false);
  const [typingUsers, setTypingUsers] = useState<Record<string, TypingUser[]>>(
    {}
  );
  const [presence, setPresence] = useState<Record<string, number>>({});
  const [currentUserName, setCurrentUserNameState] = useState<string | null>(
    null
  );
  const [messagesByChannel, setMessagesByChannel] = useState<
    Record<string, Message[]>
  >({});
  const receivedMessageIds = useRef(new Set<string>());

  const initializedUserId = useRef<string | null>(null);

  useEffect(() => {
    if (userId && userId !== initializedUserId.current) {
      console.log("PubNubProvider: Initializing service for", userId);
      initializedUserId.current = userId;
      setMessagesByChannel({});
      receivedMessageIds.current.clear();

      const init = async () => {
        const instance = await pubnubService.initialize(userId);
        setClientInstance(instance);
        setIsInitialized(pubnubService.initialized);

        if (instance) {
          pubnubService.setupListeners({
            onMessage: (channel, event: MessageEvent) => {
              const messageData = event.message;

              if (
                messageData &&
                messageData.message &&
                typeof messageData.sender === "string" &&
                messageData.sender_id &&
                messageData.timestamp
              ) {
                const messageId =
                  messageData.id ||
                  `${messageData.sender_id}-${messageData.timestamp}`;

                if (receivedMessageIds.current.has(messageId)) {
                  return;
                }
                receivedMessageIds.current.add(messageId);

                const newMessage: Message = {
                  id: messageId,
                  sender: {
                    id: messageData.sender_id,
                    name: messageData.sender,
                  },
                  message: messageData.message,
                  timestamp: messageData.timestamp,
                  channel_id: channel,
                };

                setMessagesByChannel((prev) => {
                  const existingMessages = prev[channel] || [];
                  if (
                    existingMessages.some((msg) => msg.id === newMessage.id)
                  ) {
                    return prev;
                  }
                  return {
                    ...prev,
                    [channel]: [...existingMessages, newMessage],
                  };
                });
              } else {
                console.warn(
                  "PubNubProvider - Received message in unexpected format or missing fields:",
                  event
                );
              }
            },
            onTypingStart: (channel, user) => {
              console.log(
                `PubNubProvider: onTypingStart - Channel: ${channel}, User:`,
                user
              );
              setTypingUsers((prev) => {
                const channelTypers = prev[channel] || [];
                if (!channelTypers.some((u) => u.id === user.id)) {
                  console.log(
                    `PubNubProvider: Adding typer ${user.name} to ${channel}`
                  );
                  return { ...prev, [channel]: [...channelTypers, user] };
                }
                console.log(
                  `PubNubProvider: Typer ${user.name} already present in ${channel}`
                );
                return prev;
              });
            },
            onTypingEnd: (channel, userId) => {
              console.log(
                `PubNubProvider: onTypingEnd - Channel: ${channel}, UserID: ${userId}`
              );
              setTypingUsers((prev) => {
                const channelTypers = prev[channel] || [];
                const userExists = channelTypers.some((u) => u.id === userId);
                if (!userExists) {
                  console.log(
                    `PubNubProvider: User ${userId} not found in typing list for ${channel}, skipping removal.`
                  );
                  return prev; // User already removed or never added
                }
                const updatedTypers = channelTypers.filter(
                  (u) => u.id !== userId
                );
                console.log(
                  `PubNubProvider: Removing typer ${userId} from ${channel}. New count: ${updatedTypers.length}`
                );
                const newState = { ...prev };
                if (updatedTypers.length > 0) {
                  newState[channel] = updatedTypers;
                } else {
                  delete newState[channel]; // Remove channel entry if no typers left
                  console.log(
                    `PubNubProvider: No typers left in ${channel}, removing channel key.`
                  );
                }
                return newState;
              });
            },
            onPresence: (event) => {
              console.log("PubNubProvider - Received Presence Event:", event);

              if (event.channel && typeof event.occupancy === "number") {
                setPresence((prev) => ({
                  ...prev,
                  [event.channel]: event.occupancy,
                }));
              } else {
                console.warn(
                  "PubNubProvider - Presence event missing channel or occupancy:",
                  event
                );
              }
            },
            onStatus: (statusEvent) => {
              setIsConnected(statusEvent.category === "PNConnectedCategory");
              if (statusEvent.category === "PNAccessDeniedCategory") {
                console.error(
                  "PubNub Access Denied - check token/permissions:",
                  statusEvent
                );
              }
            },
            onError: (errorEvent) => {
              console.error("PubNub Error Event:", errorEvent);
              setIsConnected(false);
            },
          });
        } else {
          setIsConnected(false);
        }
      };
      init();
    } else if (!userId && initializedUserId.current) {
      console.log("PubNubProvider: Cleaning up service due to user logout.");
      pubnubService.cleanup();
      setClientInstance(null);
      setIsInitialized(false);
      setIsConnected(false);
      setTypingUsers({});
      setPresence({});
      setCurrentUserNameState(null);
      setMessagesByChannel({});
      receivedMessageIds.current.clear();
      initializedUserId.current = null;
    }
  }, [userId]);

  const startTyping = useCallback((channel: string) => {
    pubnubService.sendTypingStart(channel);
  }, []);

  const stopTyping = useCallback((channel: string) => {
    pubnubService.sendTypingEnd(channel);
  }, []);

  const subscribe = useCallback((channels: string[]) => {
    pubnubService.subscribe(channels);
  }, []);

  const unsubscribe = useCallback((channels: string[]) => {
    pubnubService.unsubscribe(channels);
  }, []);

  const handleSetUserName = useCallback((name: string) => {
    setCurrentUserNameState(name);
    pubnubService.userName = name;
  }, []);

  const getMessagesForChannel = useCallback(
    (channelId: string): Message[] => {
      return messagesByChannel[channelId] || [];
    },
    [messagesByChannel]
  );

  const contextValue: PubNubContextType = {
    client: clientInstance,
    isInitialized,
    isConnected,
    typingUsers,
    startTyping,
    stopTyping,
    presence,
    subscribe,
    unsubscribe,
    currentUserName,
    setCurrentUserName: handleSetUserName,
    userId: pubnubService.userId,
    messagesByChannel,
    getMessagesForChannel,
  };

  const fallbackClient = new PubNub({
    publishKey: "demo",
    subscribeKey: "demo",
    userId: "anonymous",
  });

  return (
    <PubNubContext.Provider value={contextValue}>
      <Provider client={clientInstance || fallbackClient}>{children}</Provider>
    </PubNubContext.Provider>
  );
};

export default PubNubProvider;
