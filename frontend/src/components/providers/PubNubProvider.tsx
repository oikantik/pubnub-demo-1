import React, { createContext, useContext, useEffect, useState } from "react";
import { PubNubProvider as Provider } from "pubnub-react";
import PubNub from "pubnub";
import pubnubClient from "../../lib/pubnub-client";

interface PubNubContextType {
  isInitialized: boolean;
  isConnected: boolean;
  refreshToken: () => Promise<void>;
  typingUsers: Record<string, string[]>;
  startTyping: (channel: string) => void;
  stopTyping: (channel: string) => void;
  presence: Record<string, number>;
}

const PubNubContext = createContext<PubNubContextType>({
  isInitialized: false,
  isConnected: false,
  refreshToken: async () => {},
  typingUsers: {},
  startTyping: () => {},
  stopTyping: () => {},
  presence: {},
});

export const usePubNubContext = () => useContext(PubNubContext);

interface PubNubProviderProps {
  children: React.ReactNode;
  userId?: string;
}

export const PubNubProvider: React.FC<PubNubProviderProps> = ({
  children,
  userId,
}) => {
  const [client, setClient] = useState<PubNub | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [typingUsers, setTypingUsers] = useState<Record<string, string[]>>({});
  const [presence, setPresence] = useState<Record<string, number>>({});

  // Initialize the PubNub client when userId changes
  useEffect(() => {
    const initPubNub = async () => {
      if (!userId) {
        setIsInitialized(false);
        setClient(null);
        return;
      }

      try {
        const pubnub = await pubnubClient.initialize(userId);
        setClient(pubnub);
        setIsInitialized(true);

        // Setup listeners
        pubnubClient.setupListeners({
          onTypingStart: (channel, sender) => {
            if (sender === userId) return; // Ignore own typing events

            setTypingUsers((prev) => {
              const channelTypers = prev[channel] || [];
              if (!channelTypers.includes(sender)) {
                return {
                  ...prev,
                  [channel]: [...channelTypers, sender],
                };
              }
              return prev;
            });
          },
          onTypingEnd: (channel, sender) => {
            if (sender === userId) return; // Ignore own typing events

            setTypingUsers((prev) => {
              const channelTypers = prev[channel] || [];
              return {
                ...prev,
                [channel]: channelTypers.filter((user) => user !== sender),
              };
            });
          },
          onPresence: (event) => {
            const { channel, occupancy } = event;
            if (typeof occupancy === "number") {
              setPresence((prev) => ({
                ...prev,
                [channel]: occupancy,
              }));
            }
          },
          onError: () => {
            setIsConnected(false);
          },
        });

        setIsConnected(true);
      } catch (error) {
        console.error("Failed to initialize PubNub:", error);
        setIsInitialized(false);
        setIsConnected(false);
      }
    };

    initPubNub();

    // Cleanup
    return () => {
      pubnubClient.cleanup();
    };
  }, [userId]);

  // Helper to start typing
  const startTyping = (channel: string) => {
    if (isInitialized && userId) {
      pubnubClient.sendTypingStart(channel);
    }
  };

  // Helper to stop typing
  const stopTyping = (channel: string) => {
    if (isInitialized && userId) {
      pubnubClient.sendTypingEnd(channel);
    }
  };

  // Refresh token helper
  const refreshToken = async () => {
    if (isInitialized && userId) {
      await pubnubClient.refreshToken();
    }
  };

  // Context value
  const contextValue: PubNubContextType = {
    isInitialized,
    isConnected,
    refreshToken,
    typingUsers,
    startTyping,
    stopTyping,
    presence,
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
    uuid: "anonymous",
  });

  return (
    <PubNubContext.Provider value={contextValue}>
      <Provider client={client || fallbackClient}>{children}</Provider>
    </PubNubContext.Provider>
  );
};

export default PubNubProvider;
