import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from "react";
import { PubNubProvider as Provider } from "pubnub-react";
import PubNub, { PresenceEvent, StatusEvent } from "pubnub";
import pubnubClient from "../../lib/pubnub-client";

// Define the typing user info with name
interface TypingUser {
  id: string;
  name: string;
}

// Define the PubNub context interface
interface PubNubContextType {
  isInitialized: boolean;
  isConnected: boolean;
  typingUsers: Record<string, TypingUser[]>;
  startTyping: (channel: string) => void;
  stopTyping: (channel: string) => void;
  presence: Record<string, number>;
  subscribeTo: (channel: string) => void;
  unsubscribeFrom: (channel: string) => void;
  currentUserName: string | null;
  setCurrentUserName: (name: string) => void;
}

// Create context with default values
const PubNubContext = createContext<PubNubContextType>({
  isInitialized: false,
  isConnected: false,
  typingUsers: {},
  startTyping: () => {},
  stopTyping: () => {},
  presence: {},
  subscribeTo: () => {},
  unsubscribeFrom: () => {},
  currentUserName: null,
  setCurrentUserName: () => {},
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
  userName?: string;
}

export const PubNubProvider: React.FC<PubNubProviderProps> = ({
  children,
  userId,
  userName,
}) => {
  const [client, setClient] = useState<PubNub | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [typingUsers, setTypingUsers] = useState<Record<string, TypingUser[]>>(
    {}
  );
  const [presence, setPresence] = useState<Record<string, number>>({});
  const [currentUserName, setCurrentUserName] = useState<string | null>(
    userName || null
  );

  // Use ref to track initialization state to prevent multiple initializations
  const isInitializing = useRef(false);

  // Update user name in client when it changes
  useEffect(() => {
    if (currentUserName && isInitialized) {
      pubnubClient.setUserName(currentUserName);
    }
  }, [currentUserName, isInitialized]);

  // Initialize the PubNub client when userId changes
  useEffect(() => {
    // Don't do anything if no userId is provided
    if (!userId) {
      setIsInitialized(false);
      setClient(null);
      return;
    }

    // Prevent multiple initializations
    if (isInitializing.current) return;
    isInitializing.current = true;

    const initPubNub = async () => {
      try {
        // Initialize with userId and userName if available
        const pubnub = await pubnubClient.initialize(
          userId,
          currentUserName || undefined
        );
        setClient(pubnub);
        setIsInitialized(true);

        // Define explicit handler functions for better debugging
        const messageHandler = (channel: string, message: any) => {
          console.log("PubNub message received:", channel, message);
        };

        const typingStartHandler = (
          channel: string,
          sender: string,
          senderName?: string
        ) => {
          if (!channel || sender === userId) {
            return;
          }

          setTypingUsers((prev) => {
            // Copy the current typing users for this channel
            const channelTypers = [...(prev[channel] || [])];

            // Check if this user is already in the typing list
            const existingIndex = channelTypers.findIndex(
              (user) => user.id === sender
            );

            // If user is already in the list, don't update
            if (existingIndex >= 0) {
              return prev;
            }

            // Add the new typing user
            const newTypers = [
              ...channelTypers,
              { id: sender, name: senderName || sender },
            ];

            // Return a completely new object to ensure React detects the change
            return {
              ...prev,
              [channel]: newTypers,
            };
          });
        };

        const typingEndHandler = (channel: string, sender: string) => {
          if (!channel || sender === userId) {
            return;
          }

          setTypingUsers((prev) => {
            // If we don't have this channel in state, nothing to do
            if (!prev[channel]) {
              return prev;
            }

            // Copy the current typing users for this channel
            const channelTypers = [...prev[channel]];

            // Filter out the user who stopped typing
            const updatedTypers = channelTypers.filter(
              (user) => user.id !== sender
            );

            // If nothing changed, return the same state
            if (updatedTypers.length === channelTypers.length) {
              return prev;
            }

            // Create a completely new object to ensure React detects the change
            return {
              ...prev,
              [channel]: updatedTypers,
            };
          });
        };

        const presenceHandler = (event: PresenceEvent) => {
          const { channel, occupancy } = event;
          if (typeof occupancy === "number") {
            setPresence((prev) => ({
              ...prev,
              [channel]: occupancy,
            }));
          }
        };

        const errorHandler = (statusEvent: StatusEvent) => {
          console.error("PubNub error:", statusEvent);
          setIsConnected(false);
        };

        // Setup listeners with explicit function references
        pubnubClient.setupListeners({
          onMessage: messageHandler,
          onTypingStart: typingStartHandler,
          onTypingEnd: typingEndHandler,
          onPresence: presenceHandler,
          onError: errorHandler,
        });

        setIsConnected(true);
      } catch (error) {
        console.error("Failed to initialize PubNub:", error);
        setIsInitialized(false);
        setIsConnected(false);
      } finally {
        isInitializing.current = false;
      }
    };

    initPubNub();

    // Cleanup
    return () => {
      pubnubClient.cleanup();
      isInitializing.current = false;
    };
  }, [userId, currentUserName]);

  // Helper to start typing - memoized to prevent recreation
  const startTyping = useCallback(
    (channel: string) => {
      // Check PubNub initialization explicitly
      if (!isInitialized || !userId || !pubnubClient.getClient()) {
        return;
      }

      // Ensure we pass the current userName
      pubnubClient.sendTypingStart(channel, currentUserName || undefined);
    },
    [isInitialized, userId, currentUserName]
  );

  // Helper to stop typing - memoized to prevent recreation
  const stopTyping = useCallback(
    (channel: string) => {
      // Check PubNub initialization explicitly
      if (!isInitialized || !userId || !pubnubClient.getClient()) {
        return;
      }

      pubnubClient.sendTypingEnd(channel);
    },
    [isInitialized, userId]
  );

  // Helper to subscribe to a single channel
  const subscribeTo = useCallback(
    (channel: string) => {
      if (isInitialized) {
        pubnubClient.subscribe([channel]);
      }
    },
    [isInitialized]
  );

  // Helper to unsubscribe from a single channel
  const unsubscribeFrom = useCallback(
    (channel: string) => {
      if (isInitialized) {
        pubnubClient.unsubscribe([channel]);
      }
    },
    [isInitialized]
  );

  // Update userName handler
  const handleSetUserName = useCallback(
    (name: string) => {
      setCurrentUserName(name);
      if (isInitialized) {
        pubnubClient.setUserName(name);
      }
    },
    [isInitialized]
  );

  // Context value with additional helpers
  const contextValue = {
    isInitialized,
    isConnected,
    typingUsers,
    startTyping,
    stopTyping,
    presence,
    subscribeTo,
    unsubscribeFrom,
    currentUserName,
    setCurrentUserName: handleSetUserName,
  };

  // Don't render anything until we're initialized or explicitly not logged in
  if (!client && userId) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  // Use a default client if not initialized
  const fallbackClient = new PubNub({
    publishKey: "demo",
    subscribeKey: "demo",
    userId: "anonymous",
  });

  return (
    <PubNubContext.Provider value={contextValue}>
      <Provider client={client || fallbackClient}>{children}</Provider>
    </PubNubContext.Provider>
  );
};

export default PubNubProvider;
