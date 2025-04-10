import PubNub, {
  MessageEvent,
  PresenceEvent,
  StatusEvent,
  ListenerParameters,
} from "pubnub";
import { API } from "./api";
import { TypingUser } from "../types";

// --- Configuration --- //
const PUBNUB_PUBLISH_KEY = import.meta.env.VITE_PUBNUB_PUBLISH_KEY;
const PUBNUB_SUBSCRIBE_KEY = import.meta.env.VITE_PUBNUB_SUBSCRIBE_KEY;

// --- Constants --- //
const TYPING_TIMEOUT_MS = 3000; // Time until typing status expires
const MODULE_NAME = "PubNubService"; // For logging

// --- Enums and Types --- //

/**
 * Types of signals sent via PubNub (excluding regular messages handled by backend)
 */
export enum PubNubSignalType {
  TYPING_START = "typing_start",
  TYPING_END = "typing_end",
}

/** Base structure for signals sent via PubNub */
interface BaseSignal {
  type: PubNubSignalType;
  senderId: string;
  timestamp: number;
}

/** Signal indicating user started typing */
interface TypingStartSignal extends BaseSignal {
  type: PubNubSignalType.TYPING_START;
  senderName?: string; // Optional display name
}

/** Signal indicating user stopped typing */
interface TypingEndSignal extends BaseSignal {
  type: PubNubSignalType.TYPING_END;
}

type PubNubSignal = TypingStartSignal | TypingEndSignal;

/** Parameters for PubNub event listeners provided by consumers (e.g., PubNubProvider) */
export interface PubNubListenerCallbacks {
  onMessage?: (channel: string, messageEvent: MessageEvent) => void; // Pass full event
  onTypingStart?: (channel: string, user: TypingUser) => void;
  onTypingEnd?: (channel: string, userId: string) => void;
  onPresence?: (presenceEvent: PresenceEvent) => void;
  onError?: (error: StatusEvent) => void;
  onStatus?: (status: StatusEvent) => void;
}

/** Internal type for tracking typing timeouts */
type TypingTimeout = ReturnType<typeof setTimeout>;

// --- PubNub Client Service (Singleton) --- //

/**
 * Provides a simplified interface for interacting with the PubNub SDK,
 * handling initialization, token management, subscriptions, listeners,
 * and typing indicators.
 */
class PubNubService {
  private static instance: PubNubService;
  private pubnub: PubNub | null = null;
  private currentUserId: string | null = null;
  private currentUserName: string | null = null;
  private typingTimeouts = new Map<string, TypingTimeout>();
  private subscribedChannels = new Set<string>();
  private currentListener: ListenerParameters | null = null;
  private isInitialized = false;
  private isInitializing = false; // Prevent race conditions
  private tokenRefreshTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private isRefreshing = false; // Prevent concurrent refreshes

  private constructor() {
    if (!PUBNUB_PUBLISH_KEY || !PUBNUB_SUBSCRIBE_KEY) {
      console.error(
        `[${MODULE_NAME}] PubNub keys not found in environment variables (VITE_PUBNUB_PUBLISH_KEY, VITE_PUBNUB_SUBSCRIBE_KEY)`
      );
    }
  }

  public static getInstance(): PubNubService {
    if (!PubNubService.instance) {
      PubNubService.instance = new PubNubService();
    }
    return PubNubService.instance;
  }

  // --- Public Getters --- //
  public get client(): PubNub | null {
    return this.pubnub;
  }
  public get userId(): string | null {
    return this.currentUserId;
  }
  public get userName(): string | null {
    return this.currentUserName;
  }
  public get initialized(): boolean {
    return this.isInitialized;
  }

  // --- Public Setters --- //
  public set userName(name: string | null) {
    this.currentUserName = name;
  }

  // --- Private Helpers --- //

  /** Logs messages with a consistent prefix */
  private log(message: string, ...optionalParams: any[]): void {
    console.log(`[${MODULE_NAME}] ${message}`, ...optionalParams);
  }
  private warn(message: string, ...optionalParams: any[]): void {
    console.warn(`[${MODULE_NAME}] ${message}`, ...optionalParams);
  }
  private error(message: string, ...optionalParams: any[]): void {
    console.error(`[${MODULE_NAME}] ${message}`, ...optionalParams);
  }

  /** Checks if the service has valid keys and is ready for operations */
  private isReady(): boolean {
    if (!this.pubnub || !this.currentUserId || !this.isInitialized) {
      this.warn(
        "Service not ready (pubnub instance or user ID missing, or not initialized)."
      );
      return false;
    }
    return true;
  }

  /** Creates the PubNub SDK configuration */
  private createConfig(userId: string): PubNub.PubnubConfig {
    return {
      publishKey: PUBNUB_PUBLISH_KEY!,
      subscribeKey: PUBNUB_SUBSCRIBE_KEY!,
      userId: userId,
      restore: true, // Automatically re-subscribe on reconnect
      heartbeatInterval: 30, // Default is higher, lower for faster presence
      presenceTimeout: 60, // Timeout before user considered offline
    };
  }

  /** Fetches the PubNub PAM token from the backend API */
  private async fetchPamToken(): Promise<string> {
    this.log("Fetching PAM token...");
    try {
      const response = await API.getPubnubToken();
      if (!response?.data?.token) {
        throw new Error("No token received from API");
      }
      this.log("PAM token fetched successfully.");
      return response.data.token;
    } catch (error) {
      this.error("Failed to fetch PAM token:", error);
      throw error; // Re-throw to be handled by initialize
    }
  }

  /** Parses token, calculates expiry from t+ttl, schedules refresh */
  private scheduleTokenRefresh(token: string): void {
    // Clear any pending refresh
    if (this.tokenRefreshTimeoutId) {
      clearTimeout(this.tokenRefreshTimeoutId);
      this.tokenRefreshTimeoutId = null;
    }

    if (!this.pubnub) {
      this.warn(
        "Cannot schedule token refresh: PubNub instance not available."
      );
      return;
    }

    try {
      const parsedToken = this.pubnub.parseToken(token);
      this.log("Parsed token for scheduling refresh:", parsedToken);

      const parsedTokenAny = parsedToken as any;
      const issuedAtTimestampSec = parsedTokenAny?.timestamp; // Issued at (seconds)
      const timeToLiveMinutes = parsedTokenAny?.ttl; // TTL (minutes)

      if (
        typeof issuedAtTimestampSec !== "number" ||
        typeof timeToLiveMinutes !== "number"
      ) {
        this.warn(
          "Could not parse issuance time (t) or TTL (ttl) from token. Proactive refresh disabled.",
          { payload: parsedToken }
        );
        return; // Cannot schedule without t and ttl
      }

      // Calculate expiration timestamp (seconds)
      const expirationTimestampSec =
        issuedAtTimestampSec + timeToLiveMinutes * 60;
      const expirationTimeMillis = expirationTimestampSec * 1000;
      const refreshBufferMillis = 5000; // 5 seconds buffer
      const currentTimeMillis = Date.now();

      const delay =
        expirationTimeMillis - currentTimeMillis - refreshBufferMillis;

      this.log(
        `Token expires at ${new Date(
          expirationTimeMillis
        ).toISOString()}. Scheduling refresh in ${Math.round(delay / 1000)}s.`
      );

      if (delay > 0) {
        this.tokenRefreshTimeoutId = setTimeout(async () => {
          this.log("Scheduled token refresh triggered.");
          await this.refreshToken();
        }, delay);
      } else {
        this.warn(
          "Token is already expired or expiring very soon. Triggering immediate refresh."
        );
        // Use Promise.resolve().then() to avoid blocking current execution stack
        Promise.resolve().then(() => this.refreshToken());
      }
    } catch (error) {
      this.error("Failed to parse token or schedule refresh:", error);
    }
  }

  /** Fetches and applies a new token, then schedules the next refresh */
  private async refreshToken(): Promise<void> {
    if (this.isRefreshing) {
      this.log("Token refresh already in progress.");
      return;
    }
    if (!this.pubnub || !this.currentUserId) {
      this.warn(
        "Cannot refresh token: PubNub instance or UserID not available."
      );
      return;
    }

    this.log("Attempting to refresh PAM token...");
    this.isRefreshing = true;

    try {
      const newToken = await this.fetchPamToken();
      this.pubnub.setToken(newToken);
      this.log("Successfully refreshed and applied new PAM token.");
      // Schedule the *next* refresh based on the new token
      this.scheduleTokenRefresh(newToken);
    } catch (error) {
      this.error("Failed to refresh PAM token:", error);
      // Consider adding more robust error handling/retry logic here if needed
    } finally {
      this.isRefreshing = false;
    }
  }

  /** Cleans up only partially initialized state on init failure */
  private cleanupPartialInit(): void {
    this.pubnub = null;
    this.currentUserId = null;
    this.currentUserName = null;
    this.isInitialized = false;
    this.isInitializing = false;
  }

  /** Cleans up the entire service instance state */
  public cleanup(): void {
    this.log("Cleaning up instance...");
    if (this.pubnub) {
      this.removeListener();
      this.unsubscribeAll();
    }
    if (this.tokenRefreshTimeoutId) {
      clearTimeout(this.tokenRefreshTimeoutId);
      this.tokenRefreshTimeoutId = null;
    }
    this.typingTimeouts.forEach(clearTimeout);
    this.typingTimeouts.clear();
    this.subscribedChannels.clear();
    this.pubnub = null;
    this.currentUserId = null;
    this.currentUserName = null;
    this.isInitialized = false;
    this.isInitializing = false;
    // Note: Does not reset the singleton instance itself, just its state
  }

  // --- Public API Methods --- //

  /** Initializes or re-initializes the PubNub client */
  public async initialize(
    userId: string,
    userName?: string
  ): Promise<PubNub | null> {
    if (!PUBNUB_PUBLISH_KEY || !PUBNUB_SUBSCRIBE_KEY) {
      this.error("Cannot initialize: PubNub keys missing.");
      return null;
    }
    if (this.isInitializing) {
      this.warn("Initialization already in progress.");
      return this.pubnub; // Return current (possibly null) instance
    }

    this.isInitializing = true;

    // If client exists and user ID matches, just refresh token
    if (this.pubnub && this.currentUserId === userId) {
      this.log("Reusing existing client for", userId);
      if (userName) this.currentUserName = userName;
      try {
        const pamToken = await this.fetchPamToken();
        this.pubnub.setToken(pamToken);
        this.log("Refreshed PAM token on existing client.");
        this.isInitialized = true; // Ensure flag is set
        this.isInitializing = false;
        this.scheduleTokenRefresh(pamToken);
        return this.pubnub;
      } catch (tokenError) {
        this.error("Failed to refresh token for existing client:", tokenError);
        // Proceed with full re-initialization might be safer here
        this.warn(
          "Proceeding with full re-initialization after token refresh failure."
        );
        // Fall through to full cleanup and init
      }
    }

    // Cleanup previous instance if any (e.g., user switch or failed refresh)
    this.cleanup(); // Cleanup sets isInitializing to false, so set it true again
    this.isInitializing = true;

    this.log("Initializing new client for user", userId);
    this.currentUserId = userId;
    this.currentUserName = userName || userId;

    try {
      const config = this.createConfig(userId);
      this.pubnub = new PubNub(config);

      const pamToken = await this.fetchPamToken();
      this.pubnub.setToken(pamToken);
      this.log("PAM token applied.");
      this.scheduleTokenRefresh(pamToken);

      this.isInitialized = true;
      this.isInitializing = false;
      this.log("Initialization successful.");
      return this.pubnub;
    } catch (error) {
      this.error("Initialization failed:", error);
      this.cleanupPartialInit(); // Cleans up state including isInitializing
      return null;
    }
  }

  /** Subscribes to a list of channels */
  public subscribe(channels: string[]): void {
    if (!this.isReady() || !this.pubnub || channels.length === 0) return;

    const newChannels = channels.filter(
      (ch) => !this.subscribedChannels.has(ch)
    );
    if (newChannels.length === 0) return;

    this.log("Subscribing to", newChannels);
    this.pubnub.subscribe({
      channels: newChannels,
      withPresence: true,
    });
    newChannels.forEach((ch) => this.subscribedChannels.add(ch));
  }

  /** Unsubscribes from a list of channels */
  public unsubscribe(channels: string[]): void {
    if (!this.pubnub || channels.length === 0) return;

    const channelsToUnsub = channels.filter((ch) =>
      this.subscribedChannels.has(ch)
    );
    if (channelsToUnsub.length === 0) return;

    this.log("Unsubscribing from", channelsToUnsub);
    this.pubnub.unsubscribe({ channels: channelsToUnsub });
    channelsToUnsub.forEach((ch) => this.subscribedChannels.delete(ch));
  }

  /** Unsubscribes from all currently subscribed channels */
  public unsubscribeAll(): void {
    if (!this.pubnub || this.subscribedChannels.size === 0) return;
    this.log("Unsubscribing from all channels");
    this.pubnub.unsubscribeAll();
    this.subscribedChannels.clear();
  }

  /** Returns a list of currently subscribed channels */
  public getSubscribedChannels(): string[] {
    return Array.from(this.subscribedChannels);
  }

  /** Publishes a signal (e.g., typing indicator) to a channel */
  private async publishSignal(
    channel: string,
    signal: PubNubSignal
  ): Promise<void> {
    if (!this.isReady() || !this.pubnub) return;

    try {
      await this.pubnub.publish({
        channel: channel,
        message: signal,
        storeInHistory: false,
      });
    } catch (error) {
      this.error("Failed to publish typing indicator message:", error, {
        channel,
        signal,
      });
    }
  }

  /** Sends a typing start indicator */
  public sendTypingStart(channel: string): void {
    if (!this.isReady()) return;

    const signal: TypingStartSignal = {
      type: PubNubSignalType.TYPING_START,
      senderId: this.currentUserId!,
      senderName: this.currentUserName || this.currentUserId!,
      timestamp: Math.floor(Date.now() / 1000),
    };
    this.publishSignal(channel, signal);

    // Clear previous timeout and set a new one
    if (this.typingTimeouts.has(channel)) {
      clearTimeout(this.typingTimeouts.get(channel)!);
    }
    const timeout = setTimeout(() => {
      this.typingTimeouts.delete(channel); // Remove before sending end
      this.sendTypingEnd(channel);
    }, TYPING_TIMEOUT_MS);
    this.typingTimeouts.set(channel, timeout);
  }

  /** Sends a typing end indicator */
  public sendTypingEnd(channel: string): void {
    // Clear timeout if it exists (prevents duplicate end signals)
    if (this.typingTimeouts.has(channel)) {
      clearTimeout(this.typingTimeouts.get(channel)!);
      this.typingTimeouts.delete(channel);
    }

    if (!this.isReady()) return; // Check readiness after clearing timeout

    const signal: TypingEndSignal = {
      type: PubNubSignalType.TYPING_END,
      senderId: this.currentUserId!,
      timestamp: Math.floor(Date.now() / 1000),
    };
    this.publishSignal(channel, signal);
  }

  // --- Listener Setup and Handling --- //

  /** Handles incoming message events from the SDK */
  private handleMessageEvent(
    event: MessageEvent,
    callbacks: PubNubListenerCallbacks
  ): void {
    // Log the raw incoming event details
    this.log(
      `handleMessageEvent - Received Timetoken: ${event.timetoken}, Channel: ${event.channel}, Publisher: ${event.publisher}, Message:`,
      event.message
    );

    const message = event.message;
    const channel = event.channel;

    // FIRST: Check if it's one of our known signal types & not self-sent
    if (
      message &&
      typeof message === "object" &&
      "type" in message &&
      "senderId" in message &&
      message.senderId !== this.currentUserId
    ) {
      this.log(
        `handleMessageEvent - Detected potential typing indicator (Type: ${message.type})`
      );
      switch ((message as BaseSignal).type) {
        case PubNubSignalType.TYPING_START:
          this.log(
            `handleMessageEvent - Calling onTypingStart callback for ${message.senderId}`
          );
          if (callbacks.onTypingStart) {
            const startSignal = message as TypingStartSignal;
            callbacks.onTypingStart(channel, {
              id: startSignal.senderId,
              name: startSignal.senderName || startSignal.senderId,
            });
          }
          return; // Processed as typing signal, do not treat as regular message
        case PubNubSignalType.TYPING_END:
          this.log(
            `handleMessageEvent - Calling onTypingEnd callback for ${message.senderId}`
          );
          if (callbacks.onTypingEnd) {
            const endSignal = message as TypingEndSignal;
            callbacks.onTypingEnd(channel, endSignal.senderId);
          }
          return; // Processed as typing signal, do not treat as regular message
      }
    }

    // SECOND: If not a known typing signal, treat as a regular message
    this.log(
      `handleMessageEvent - Not a typing indicator, calling onMessage callback.`
    );
    if (callbacks.onMessage) {
      callbacks.onMessage(channel, event);
    }
  }

  /** Handles incoming presence events from the SDK */
  private handlePresenceEvent(
    event: PresenceEvent,
    callbacks: PubNubListenerCallbacks
  ): void {
    callbacks.onPresence?.(event);
  }

  /** Handles incoming status events from the SDK */
  private handleStatusEvent(
    event: StatusEvent,
    callbacks: PubNubListenerCallbacks
  ): void {
    this.log("Status Event:", event);
    callbacks.onStatus?.(event);

    if (event.category === "PNAccessDeniedCategory") {
      this.warn(
        `Received Access Denied (Category: ${event.category}). Assuming token expired or invalid. Triggering refresh.`,
        { statusEvent: event }
      );
      setTimeout(() => this.refreshToken(), 500); // 500ms delay
    }

    // Example: Trigger onError for specific critical categories
    if (
      event.category === "PNAccessDeniedCategory" ||
      event.category === "PNNetworkIssuesCategory"
    ) {
      this.error("Critical Status Event:", event);
      callbacks.onError?.(event);
    }
  }

  /** Creates the listener object for the PubNub SDK */
  private createListener(
    callbacks: PubNubListenerCallbacks
  ): ListenerParameters {
    return {
      message: (event) => this.handleMessageEvent(event, callbacks),
      presence: (event) => this.handlePresenceEvent(event, callbacks),
      status: (event) => this.handleStatusEvent(event, callbacks),
    };
  }

  /** Sets up the main event listeners. Replaces any existing listeners. */
  public setupListeners(callbacks: PubNubListenerCallbacks): void {
    if (!this.pubnub) {
      this.warn("Cannot setup listeners, client not initialized.");
      return;
    }
    this.removeListener();
    this.log(
      "Setting up listeners (handling typing signals in message listener)."
    );
    this.currentListener = this.createListener(callbacks);
    this.pubnub.addListener(this.currentListener);
  }

  /** Removes the currently active listener */
  public removeListener(): void {
    if (this.pubnub && this.currentListener) {
      this.log("Removing listener.");
      this.pubnub.removeListener(this.currentListener);
      this.currentListener = null;
    }
  }
}

// Export the singleton instance
export default PubNubService.getInstance();
