import PubNub, {
  MessageEvent,
  PresenceEvent,
  StatusEvent,
  ListenerParameters,
} from "pubnub";
import { API } from "./api";

/**
 * PubNub configuration keys from environment variables
 * These are used to establish the connection to PubNub's real-time network
 */
const PUBNUB_PUBLISH_KEY =
  import.meta.env.VITE_PUBNUB_PUBLISH_KEY || "pub-c-your-publish-key";
const PUBNUB_SUBSCRIBE_KEY =
  import.meta.env.VITE_PUBNUB_SUBSCRIBE_KEY || "sub-c-your-subscribe-key";

/**
 * Message types for real-time events
 * Used to differentiate between different types of real-time updates
 * REGULAR is not used by this client as message sending is handled by the backend
 */
export enum MessageType {
  REGULAR = "message",
  TYPING_START = "typing_start",
  TYPING_END = "typing_end",
}

/**
 * Subscription manager interface
 * Defines methods for managing channel subscriptions
 */
interface ISubscriptionManager {
  /** Subscribe to one or more channels */
  subscribe(channels: string[]): void;

  /** Unsubscribe from one or more channels */
  unsubscribe(channels: string[]): void;

  /** Get list of all currently subscribed channels */
  getActiveSubscriptions(): string[];
}

/**
 * Base message interface for all PubNub messages
 * Provides common fields required in all message types
 */
export interface BaseMessage {
  /** Type of message being sent */
  type: MessageType;

  /** User ID of the sender */
  sender: string;

  /** Timestamp when the message was created */
  timestamp: number;
}

/**
 * Regular message interface (not used in this client)
 * Kept for type consistency and potential future use
 */
export interface RegularMessage extends BaseMessage {
  type: MessageType.REGULAR;
  content: string;
}

/**
 * Typing indicator message interface
 * Used for real-time typing status updates
 */
export interface TypingMessage extends BaseMessage {
  type: MessageType.TYPING_START | MessageType.TYPING_END;

  /** Display name of the user who is typing (optional) */
  senderName?: string;
}

/**
 * Real-time typing indicator service interface
 * Focuses solely on typing indicators (not message sending)
 */
interface ITypingIndicatorService {
  /** Signal that a user has started typing in a channel */
  sendTypingStart(channel: string, senderName?: string): void;

  /** Signal that a user has stopped typing in a channel */
  sendTypingEnd(channel: string): void;
}

/**
 * PubNub event listener interface
 * Defines methods for setting up and managing listeners
 */
interface IListenerService {
  /** Set up listeners for various PubNub events */
  setupListeners(params: PubNubListenerParams): void;

  /** Remove all active listeners */
  removeAllListeners(): void;
}

/**
 * Client initialization interface
 * Defines methods for initializing and managing the PubNub client
 */
interface IClientInitializer {
  /** Initialize the PubNub client with user credentials */
  initialize(userId: string, userName?: string): Promise<PubNub>;

  /** Get the current PubNub client instance */
  getClient(): PubNub | null;

  /** Clean up resources when the client is no longer needed */
  cleanup(): void;
}

/**
 * Parameters for PubNub event listeners
 * Defines callbacks for different event types
 */
interface PubNubListenerParams {
  /** Callback for regular messages */
  onMessage?: (channel: string, message: any) => void;

  /** Callback for typing start events with sender information */
  onTypingStart?: (
    channel: string,
    sender: string,
    senderName?: string
  ) => void;

  /** Callback for typing end events */
  onTypingEnd?: (channel: string, sender: string) => void;

  /** Callback for presence events (user joined/left) */
  onPresence?: (presenceEvent: PresenceEvent) => void;

  /** Callback for error events */
  onError?: (error: StatusEvent) => void;
}

/**
 * PubNub configuration interface
 * Defines the structure of the configuration object
 */
interface PubNubConfig {
  publishKey: string;
  subscribeKey: string;
  userId: string;
  heartbeatInterval?: number;
  presenceTimeout?: number;
}

/** Type for typing indicator timeout objects */
type TypingTimeout = ReturnType<typeof setTimeout>;

/**
 * PubNubClient class
 *
 * This class implements a real-time communication client using PubNub's services,
 * focusing on real-time typing indicators. The messaging functionality is not included
 * as it's handled by the backend API.
 *
 * The client follows a singleton pattern to ensure only one instance exists.
 *
 * Flow of operations:
 * 1. Client is initialized with user credentials
 * 2. Client connects to PubNub and subscribes to channels
 * 3. Client publishes typing indicators as users type
 * 4. Client listens for typing indicators from other users
 * 5. Client passes these events to registered callbacks
 */
export class PubNubClient
  implements
    IClientInitializer,
    ISubscriptionManager,
    ITypingIndicatorService,
    IListenerService
{
  /** Singleton instance of the client */
  private static instance: PubNubClient;

  /** The PubNub SDK client instance */
  private pubnubInstance: PubNub | null = null;

  /** The current user's ID */
  private currentUserId: string | null = null;

  /** The current user's display name */
  private currentUserName: string | null = null;

  /** Map of active typing timeouts by channel */
  private typingTimeoutsByChannel: Map<string, TypingTimeout> = new Map();

  /** Set of currently subscribed channels */
  private activeSubscribedChannels: Set<string> = new Set();

  /** Current active listener reference */
  private activeListener: ListenerParameters | null = null;

  /** Private constructor to prevent direct instantiation */
  private constructor() {}

  /**
   * Get the singleton instance of PubNubClient
   * Creates a new instance if one doesn't exist
   */
  public static getInstance(): PubNubClient {
    if (!PubNubClient.instance) {
      PubNubClient.instance = new PubNubClient();
    }
    return PubNubClient.instance;
  }

  /**
   * Create a PubNub configuration object with the given user ID
   *
   * @param userId - The unique identifier for the user
   * @returns PubNub configuration object
   */
  private createPubnubConfig(userId: string): PubNubConfig {
    return {
      publishKey: PUBNUB_PUBLISH_KEY,
      subscribeKey: PUBNUB_SUBSCRIBE_KEY,
      userId: userId,
      heartbeatInterval: 30,
      presenceTimeout: 60,
    };
  }

  /**
   * Create a new PubNub client instance with the given configuration
   *
   * @param config - The PubNub configuration
   * @returns New PubNub instance
   */
  private createPubnubInstance(config: PubNubConfig): PubNub {
    return new PubNub(config);
  }

  /**
   * Fetch an authentication token from the API
   *
   * @returns Promise resolving to the token string
   */
  private async fetchAuthToken(): Promise<string> {
    const response = await API.getPubnubToken();
    return response.data.token;
  }

  /**
   * Apply an authentication token to the PubNub client
   *
   * @param token - The authentication token
   */
  private applyAuthToken(token: string): void {
    if (!this.pubnubInstance) return;
    this.pubnubInstance.setToken(token);
  }

  /**
   * Check if the existing client can be reused for the given user
   *
   * @param userId - The user ID to check
   * @returns Whether the client can be reused
   */
  private canReuseExistingClient(userId: string): boolean {
    return !!this.pubnubInstance && this.currentUserId === userId;
  }

  /**
   * Initialize the PubNub client with user information
   *
   * This method is the entry point for setting up the PubNub client.
   * It authenticates with the server, sets up the client with the
   * correct credentials, and prepares it for real-time communication.
   *
   * @param userId - The unique identifier for the user
   * @param userName - The display name of the user (optional)
   * @returns Promise resolving to the initialized PubNub client
   */
  public async initialize(userId: string, userName?: string): Promise<PubNub> {
    // Reuse existing client if possible
    if (this.canReuseExistingClient(userId)) {
      // Update userName if it changed
      if (userName) {
        this.currentUserName = userName;
      }
      return this.pubnubInstance!;
    }

    // Clean up any existing client
    this.cleanup();

    // Set user information
    this.currentUserId = userId;
    this.currentUserName = userName || userId;

    try {
      // Create and initialize client
      const config = this.createPubnubConfig(userId);
      this.pubnubInstance = this.createPubnubInstance(config);

      // Get and apply authentication token
      const token = await this.fetchAuthToken();
      this.applyAuthToken(token);

      return this.pubnubInstance;
    } catch (error) {
      // Initialize with default config as fallback
      const fallbackConfig = this.createPubnubConfig(userId);
      this.pubnubInstance = this.createPubnubInstance(fallbackConfig);
      return this.pubnubInstance;
    }
  }

  /**
   * Get the current PubNub client instance
   *
   * @returns The current PubNub client or null if not initialized
   */
  public getClient(): PubNub | null {
    return this.pubnubInstance;
  }

  /**
   * Filter out channels that are already subscribed to
   *
   * @param channels - Array of channel names to filter
   * @returns Array of channels that are not yet subscribed
   */
  private filterNewChannels(channels: string[]): string[] {
    return channels.filter(
      (channel) => !this.activeSubscribedChannels.has(channel)
    );
  }

  /**
   * Add channels to the set of active subscriptions
   *
   * @param channels - Channels to track as subscribed
   */
  private trackSubscribedChannels(channels: string[]): void {
    channels.forEach((channel) => this.activeSubscribedChannels.add(channel));
  }

  /**
   * Perform the actual subscription to channels using PubNub
   *
   * @param channels - Channels to subscribe to
   */
  private executeChannelSubscription(channels: string[]): void {
    if (!this.pubnubInstance || channels.length === 0) return;

    this.pubnubInstance.subscribe({
      channels,
      withPresence: true,
    });
  }

  /**
   * Subscribe to channels to receive real-time updates
   *
   * @param channels - Array of channel names to subscribe to
   */
  public subscribe(channels: string[]): void {
    if (!this.pubnubInstance) {
      return;
    }

    // Only subscribe to channels we're not already subscribed to
    const newChannels = this.filterNewChannels(channels);

    if (newChannels.length === 0) {
      return; // Nothing new to subscribe to
    }

    // Track and subscribe to new channels
    this.trackSubscribedChannels(newChannels);
    this.executeChannelSubscription(channels);
  }

  /**
   * Remove channels from the set of active subscriptions
   *
   * @param channels - Channels to untrack
   */
  private untrackSubscribedChannels(channels: string[]): void {
    channels.forEach((channel) =>
      this.activeSubscribedChannels.delete(channel)
    );
  }

  /**
   * Perform the actual unsubscribe operation using PubNub
   *
   * @param channels - Channels to unsubscribe from
   */
  private executeChannelUnsubscription(channels: string[]): void {
    if (!this.pubnubInstance || channels.length === 0) return;

    this.pubnubInstance.unsubscribe({
      channels,
    });
  }

  /**
   * Unsubscribe from channels to stop receiving updates
   *
   * @param channels - Array of channel names to unsubscribe from
   */
  public unsubscribe(channels: string[]): void {
    if (!this.pubnubInstance) return;

    // Remove from tracking and unsubscribe
    this.untrackSubscribedChannels(channels);
    this.executeChannelUnsubscription(channels);
  }

  /**
   * Get a list of all currently subscribed channels
   *
   * @returns Array of channel names
   */
  public getActiveSubscriptions(): string[] {
    return Array.from(this.activeSubscribedChannels);
  }

  /**
   * Publishes a message to a channel
   * @param channel The channel to publish to
   * @param message The message to publish
   * @param storeInHistory Whether to store the message in history (default: true)
   */
  private async publishMessage(
    channel: string,
    message: Record<string, any>,
    storeInHistory: boolean = true
  ): Promise<void> {
    if (!this.pubnubInstance) throw new Error("PubNub client not initialized");
    if (!channel || channel.trim() === "") {
      return;
    }

    try {
      await this.pubnubInstance.publish({
        channel,
        message,
        storeInHistory,
      });
    } catch (error) {
      throw error;
    }
  }

  /**
   * Sends a typing start indicator to the specified channel
   * @param channel The channel to send the typing indicator to
   * @param displayName Optional display name to send with the typing indicator
   */
  public async sendTypingStart(
    channel: string,
    displayName?: string
  ): Promise<void> {
    if (!this.isClientReady()) return;

    if (!channel) {
      console.error("Cannot send typing start: channel is required");
      return;
    }

    try {
      const actualName =
        displayName || this.currentUserName || this.currentUserId || "";

      await this.publishMessage(
        channel,
        {
          type: MessageType.TYPING_START,
          sender: this.currentUserId || "",
          senderName: actualName,
          timestamp: Math.floor(Date.now() / 1000),
        },
        false
      );
    } catch (error) {
      console.error("Failed to send typing start:", error);
    }
  }

  /**
   * Sends a typing end indicator to the specified channel
   * @param channel The channel to send the typing end indicator to
   */
  public async sendTypingEnd(channel: string): Promise<void> {
    if (!this.isClientReady()) return;

    if (!channel) {
      console.error("Cannot send typing end: channel is required");
      return;
    }

    try {
      await this.publishMessage(
        channel,
        {
          type: MessageType.TYPING_END,
          sender: this.currentUserId || "",
          timestamp: Math.floor(Date.now() / 1000),
        },
        false
      );
    } catch (error) {
      console.error("Failed to send typing end:", error);
    }
  }

  /**
   * Process incoming message events and route to appropriate handlers
   *
   * @param event - The PubNub message event
   * @param params - Listener parameters with callbacks
   */
  private handleMessageEvent(
    event: MessageEvent,
    params: PubNubListenerParams
  ): void {
    const message = event.message;
    const channel = event.channel;

    // Check if the message has the expected structure
    if (!message || typeof message !== "object") {
      if (params.onMessage) {
        params.onMessage(channel, message);
      }
      return;
    }

    // Handle based on message type
    if ("type" in message) {
      switch (message.type) {
        case MessageType.TYPING_START:
          if (params.onTypingStart && message.sender) {
            const senderName = message.senderName || message.sender;
            params.onTypingStart(channel, message.sender, senderName);
          }
          break;

        case MessageType.TYPING_END:
          if (params.onTypingEnd && message.sender) {
            params.onTypingEnd(channel, message.sender);
          }
          break;

        case MessageType.REGULAR:
          if (params.onMessage) {
            params.onMessage(channel, message);
          }
          break;

        default:
          // Default handler for unrecognized message types
          if (params.onMessage) {
            params.onMessage(channel, message);
          }
          break;
      }
      return;
    }

    // Default handler for messages without a type field
    if (params.onMessage) {
      params.onMessage(channel, message);
    }
  }

  /**
   * Process presence events (users joining/leaving channels)
   *
   * @param event - The PubNub presence event
   * @param params - Listener parameters with callbacks
   */
  private handlePresenceEvent(
    event: PresenceEvent,
    params: PubNubListenerParams
  ): void {
    if (params.onPresence) {
      params.onPresence(event);
    }
  }

  /**
   * Process status events (connection state changes, errors)
   *
   * @param statusEvent - The PubNub status event
   * @param params - Listener parameters with callbacks
   */
  private handleStatusEvent(
    statusEvent: StatusEvent,
    params: PubNubListenerParams
  ): void {
    // Handle common status categories
    if (statusEvent.category === "PNConnectedCategory") {
      console.log("PubNub connected successfully");
    } else if (
      statusEvent.category === "PNAccessDeniedCategory" ||
      statusEvent.category === "PNBadRequestCategory"
    ) {
      console.error("PubNub access issue:", statusEvent);
      if (params.onError) {
        params.onError(statusEvent);
      }
    }
  }

  /**
   * Create a new listener object with the provided callbacks
   *
   * @param params - Listener parameters with callbacks
   * @returns PubNub listener object
   */
  private createEventListener(
    params: PubNubListenerParams
  ): ListenerParameters {
    return {
      message: (event: MessageEvent) => this.handleMessageEvent(event, params),
      presence: (event: PresenceEvent) =>
        this.handlePresenceEvent(event, params),
      status: (statusEvent: StatusEvent) =>
        this.handleStatusEvent(statusEvent, params),
    };
  }

  /**
   * Set up listeners for PubNub events
   * This will receive typing indicators and other real-time updates
   *
   * @param params - Object containing callback functions for different events
   */
  public setupListeners(params: PubNubListenerParams): void {
    if (!this.pubnubInstance) return;

    // Remove any existing listeners first
    this.removeAllListeners();

    // Create and add new listener
    this.activeListener = this.createEventListener(params);
    this.pubnubInstance.addListener(this.activeListener);
  }

  /**
   * Remove all active PubNub listeners
   * Important for cleanup to prevent memory leaks
   */
  public removeAllListeners(): void {
    if (!this.pubnubInstance) return;

    if (this.activeListener) {
      this.pubnubInstance.removeListener(this.activeListener);
      this.activeListener = null;
    }
  }

  /**
   * Clear all typing timeouts
   * Used during cleanup to prevent memory leaks
   */
  private clearAllTypingTimeouts(): void {
    this.typingTimeoutsByChannel.forEach((timeout) => clearTimeout(timeout));
    this.typingTimeoutsByChannel.clear();
  }

  /**
   * Clean up resources when the client is no longer needed
   * Important to call this when unmounting to prevent memory leaks
   */
  public cleanup(): void {
    if (this.pubnubInstance) {
      // Clear all timeouts
      this.clearAllTypingTimeouts();

      // Clear tracked subscriptions
      this.activeSubscribedChannels.clear();

      // Remove listeners and unsubscribe
      this.removeAllListeners();
      this.pubnubInstance.unsubscribeAll();

      // Clear client and user info
      this.pubnubInstance = null;
      this.currentUserId = null;
      this.currentUserName = null;
    }
  }

  /**
   * Get the current user ID
   *
   * @returns User ID or null if not set
   */
  public getUserId(): string | null {
    return this.currentUserId;
  }

  /**
   * Get the current user's display name
   *
   * @returns User name or null if not set
   */
  public getUserName(): string | null {
    return this.currentUserName || this.currentUserId;
  }

  /**
   * Set the user's display name
   *
   * @param name - New display name to use
   */
  public setUserName(name: string): void {
    this.currentUserName = name;
  }

  /**
   * Checks if the client is properly initialized
   * @returns boolean indicating if both pubnubInstance and currentUserId are set
   */
  private isClientReady(): boolean {
    if (!this.pubnubInstance || !this.currentUserId) {
      console.error(
        "Cannot send typing start: client or userId not initialized"
      );
      return false;
    }
    return true;
  }
}

/**
 * Export a singleton instance of the PubNubClient
 * This ensures the same instance is used throughout the application
 */
export default PubNubClient.getInstance();
