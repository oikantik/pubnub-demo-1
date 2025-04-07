import PubNub from "pubnub";
import { API } from "./api";

const PUBNUB_PUBLISH_KEY =
  import.meta.env.VITE_PUBNUB_PUBLISH_KEY || "pub-c-your-publish-key";
const PUBNUB_SUBSCRIBE_KEY =
  import.meta.env.VITE_PUBNUB_SUBSCRIBE_KEY || "sub-c-your-subscribe-key";

// Token update channel constant
const TOKEN_UPDATES = "token-updates";

interface PubNubListenerParams {
  onMessage?: (channel: string, message: any) => void;
  onTypingStart?: (channel: string, sender: string) => void;
  onTypingEnd?: (channel: string, sender: string) => void;
  onPresence?: (presenceEvent: any) => void;
  onTokenRefresh?: () => void;
  onError?: (error: any) => void;
}

type TypingTimeout = ReturnType<typeof setTimeout>;

export class PubNubClient {
  private static instance: PubNubClient;
  private client: PubNub | null = null;
  private userId: string | null = null;
  private typingTimeouts: Record<string, TypingTimeout> = {};

  // Private constructor for Singleton pattern
  private constructor() {}

  // Get singleton instance
  public static getInstance(): PubNubClient {
    if (!PubNubClient.instance) {
      PubNubClient.instance = new PubNubClient();
    }
    return PubNubClient.instance;
  }

  // Initialize the PubNub client with user information
  public async initialize(userId: string): Promise<PubNub> {
    this.userId = userId;

    try {
      // Get a fresh token from the API
      const response = await API.getPubnubToken();
      const pubnubToken = response.data.token;

      // Create configuration for PubNub client
      const config = {
        publishKey: PUBNUB_PUBLISH_KEY,
        subscribeKey: PUBNUB_SUBSCRIBE_KEY,
        uuid: userId,
        authKey: pubnubToken,
        heartbeatInterval: 30,
        presenceTimeout: 60,
      };

      // Initialize the client
      this.client = new PubNub(config);
      console.log("PubNub client initialized with token");

      return this.client;
    } catch (error) {
      console.error("Failed to initialize PubNub client:", error);
      // Initialize with default config on error
      this.client = new PubNub({
        publishKey: PUBNUB_PUBLISH_KEY,
        subscribeKey: PUBNUB_SUBSCRIBE_KEY,
        uuid: userId,
      });
      return this.client;
    }
  }

  // Get the current client
  public getClient(): PubNub | null {
    return this.client;
  }

  // Refresh PubNub token
  public async refreshToken(): Promise<void> {
    if (!this.client || !this.userId) return;

    try {
      const response = await API.getPubnubToken();
      const pubnubToken = response.data.token;

      // Need to recreate the client with the new token
      const config = {
        publishKey: PUBNUB_PUBLISH_KEY,
        subscribeKey: PUBNUB_SUBSCRIBE_KEY,
        uuid: this.userId,
        authKey: pubnubToken,
        heartbeatInterval: 30,
        presenceTimeout: 60,
      };

      // First clean up the old client
      if (this.client) {
        this.client.unsubscribeAll();
      }

      // Initialize with new token
      this.client = new PubNub(config);
      console.log("PubNub token refreshed");
    } catch (error) {
      console.error("Failed to refresh PubNub token:", error);
    }
  }

  // Subscribe to channels
  public subscribe(channels: string[]): void {
    if (!this.client) return;

    this.client.subscribe({
      channels: [...channels, TOKEN_UPDATES],
      withPresence: true,
    });
  }

  // Unsubscribe from channels
  public unsubscribe(channels: string[]): void {
    if (!this.client) return;

    this.client.unsubscribe({
      channels,
    });
  }

  // Send a message
  public async sendMessage(channel: string, message: string): Promise<void> {
    if (!this.client) return;

    try {
      await this.client.publish({
        channel,
        message: {
          type: "message",
          content: message,
          sender: this.userId,
          timestamp: Math.floor(Date.now() / 1000),
        },
      });
    } catch (error: any) {
      console.error("Failed to send message:", error);
      // If token expired, refresh and try again
      if (
        error &&
        error.status &&
        error.status.category === "PNAccessDeniedCategory"
      ) {
        await this.refreshToken();
        // Retry sending the message once
        try {
          await this.client?.publish({
            channel,
            message: {
              type: "message",
              content: message,
              sender: this.userId,
              timestamp: Math.floor(Date.now() / 1000),
            },
          });
        } catch (retryError) {
          console.error(
            "Failed to send message after token refresh:",
            retryError
          );
        }
      }
    }
  }

  // Signal that user is typing
  public sendTypingStart(channel: string): void {
    if (!this.client || !this.userId) return;

    // Clear existing timeout if any
    if (this.typingTimeouts[channel]) {
      clearTimeout(this.typingTimeouts[channel]);
    }

    this.client.signal({
      channel,
      message: {
        type: "typing_start",
        sender: this.userId,
      },
    });

    // Automatically stop typing after 5 seconds
    this.typingTimeouts[channel] = setTimeout(() => {
      this.sendTypingEnd(channel);
    }, 5000);
  }

  // Signal that user stopped typing
  public sendTypingEnd(channel: string): void {
    if (!this.client || !this.userId) return;

    // Clear timeout if it exists
    if (this.typingTimeouts[channel]) {
      clearTimeout(this.typingTimeouts[channel]);
      delete this.typingTimeouts[channel];
    }

    this.client.signal({
      channel,
      message: {
        type: "typing_end",
        sender: this.userId,
      },
    });
  }

  // Set up listeners for various PubNub events
  public setupListeners({
    onMessage,
    onTypingStart,
    onTypingEnd,
    onPresence,
    onTokenRefresh,
    onError,
  }: PubNubListenerParams): void {
    if (!this.client) return;

    // Remove any existing listeners first
    this.client.removeListener({});

    this.client.addListener({
      message: (event) => {
        // Handle token refresh notifications
        if (event.channel === TOKEN_UPDATES) {
          const data = event.message;
          if (data.event === "token_refresh" && data.user_id === this.userId) {
            console.log("Token refresh notification received");
            this.refreshToken();
            onTokenRefresh?.();
          }
          return;
        }

        // Handle regular messages
        if (onMessage) {
          onMessage(event.channel, event.message);
        }
      },
      signal: (event) => {
        // Handle typing indicators
        const data = event.message;
        if (data.type === "typing_start" && onTypingStart) {
          onTypingStart(event.channel, data.sender);
        } else if (data.type === "typing_end" && onTypingEnd) {
          onTypingEnd(event.channel, data.sender);
        }
      },
      presence: (event) => {
        if (onPresence) {
          onPresence(event);
        }
      },
      status: (statusEvent) => {
        if (statusEvent.category === "PNConnectedCategory") {
          console.log("PubNub connected");
        } else if (
          statusEvent.category === "PNAccessDeniedCategory" ||
          statusEvent.category === "PNBadRequestCategory"
        ) {
          console.error("PubNub access issue:", statusEvent);
          if (onError) {
            onError(statusEvent);
          }
          // Try refreshing the token on access issues
          this.refreshToken();
        }
      },
    });
  }

  // Clean up resources
  public cleanup(): void {
    if (this.client) {
      // Clear all typing timeouts
      Object.keys(this.typingTimeouts).forEach((channel) => {
        clearTimeout(this.typingTimeouts[channel]);
      });
      this.typingTimeouts = {};

      // Unsubscribe from all channels
      this.client.unsubscribeAll();
      this.client.removeListener({});
      this.client = null;
      this.userId = null;
    }
  }
}

export default PubNubClient.getInstance();
