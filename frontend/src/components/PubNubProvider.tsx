import React, { useState, useEffect } from "react";
import PubNub from "pubnub";
import { PubNubProvider as Provider } from "pubnub-react";

const PUBNUB_PUBLISH_KEY =
  import.meta.env.VITE_PUBNUB_PUBLISH_KEY || "pub-c-your-publish-key";
const PUBNUB_SUBSCRIBE_KEY =
  import.meta.env.VITE_PUBNUB_SUBSCRIBE_KEY || "sub-c-your-subscribe-key";
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:9292";

// Token update channel constant - must match server
const TOKEN_UPDATES = "token-updates";

interface PubNubProviderProps {
  children: React.ReactNode;
  userId?: string;
  authToken?: string;
}

const PubNubProvider: React.FC<PubNubProviderProps> = ({
  children,
  userId,
  authToken,
}) => {
  const [pubnubToken, setPubnubToken] = useState<string | null>(null);
  const [pubnubClient, setPubnubClient] = useState<PubNub | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  // Fetch PubNub token from API
  const fetchPubnubToken = async () => {
    if (!authToken && !userId) return;

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (authToken) {
        headers["Authorization"] = `Bearer ${authToken}`;
      }

      const response = await fetch(`${API_URL}/v1/tokens/pubnub`, {
        method: "POST",
        headers,
      });

      if (response.ok) {
        const data = await response.json();
        console.log("Got new PubNub token");
        setPubnubToken(data.token);
      } else {
        console.error("Failed to get PubNub token:", await response.text());
      }
    } catch (error) {
      console.error("Error fetching PubNub token:", error);
    }
  };

  // Initialize PubNub client when token is available
  useEffect(() => {
    if (!pubnubToken) {
      // If authenticated but no token, fetch one
      if (userId) {
        fetchPubnubToken();
      }
      return;
    }

    // Create client with the token
    const config: any = {
      publishKey: PUBNUB_PUBLISH_KEY,
      subscribeKey: PUBNUB_SUBSCRIBE_KEY,
      uuid: userId || `guest-${Math.random().toString(36).substring(2, 9)}`,
      heartbeatInterval: 30,
      presenceTimeout: 60,
    };

    // Add the token as authKey - different PubNub versions use different property names
    if (pubnubToken) {
      // Try both formats to ensure compatibility
      config.authKey = pubnubToken;
    }

    const client = new PubNub(config);

    // Subscribe to token updates channel
    client.subscribe({
      channels: [TOKEN_UPDATES],
    });

    // Listen for token refresh notifications
    client.addListener({
      message: (event) => {
        if (event.channel === TOKEN_UPDATES) {
          const data = event.message;

          // Check if this token refresh is for us
          if (data.event === "token_refresh" && data.user_id === userId) {
            console.log("Token refresh notification received");
            fetchPubnubToken();
          }
        }
      },
      status: (statusEvent) => {
        if (statusEvent.category === "PNConnectedCategory") {
          console.log("PubNub connected");
          setIsConnected(true);
        } else if (statusEvent.category === "PNNetworkDownCategory") {
          console.log("PubNub network down");
          setIsConnected(false);
        } else if (statusEvent.category === "PNNetworkUpCategory") {
          console.log("PubNub network up, refreshing token");
          setIsConnected(true);
          // Refresh token on reconnect to ensure we have access to all channels
          fetchPubnubToken();
        } else if (statusEvent.category === "PNReconnectedCategory") {
          console.log("PubNub reconnected, refreshing token");
          setIsConnected(true);
          // Refresh token on reconnect
          fetchPubnubToken();
        } else if (
          statusEvent.category === "PNAccessDeniedCategory" ||
          statusEvent.category === "PNBadRequestCategory"
        ) {
          console.error("PubNub access issue:", statusEvent);
          // Try refreshing the token on access issues
          fetchPubnubToken();
        }
      },
    });

    setPubnubClient(client);

    // Cleanup
    return () => {
      client.unsubscribe({
        channels: [TOKEN_UPDATES],
      });
    };
  }, [pubnubToken, userId, authToken]);

  // Handle authentication status changes
  useEffect(() => {
    if (userId) {
      // Always get a fresh token when user ID changes
      fetchPubnubToken();
    } else {
      // Reset token on logout
      setPubnubToken(null);
    }
  }, [userId, authToken]);

  // Don't render until we have a PubNub client
  if (!pubnubClient) {
    return <div>Initializing real-time communication...</div>;
  }

  return <Provider client={pubnubClient}>{children}</Provider>;
};

export default PubNubProvider;
