// frontend/src/types/index.ts

// Represents a user, potentially including online status
export interface User {
  id: string;
  name: string;
  status?: string; // e.g., 'online', 'offline'
  created_at?: string;
  updated_at?: string;
}

// Represents a chat channel
export interface Channel {
  id: string;
  name: string;
  description?: string;
  created_by?: string; // User ID
  created_at?: string;
  updated_at?: string;
  joined?: boolean; // Added by frontend/backend logic
  members?: User[]; // Use array of User objects as returned by API
}

// Represents a chat message
export interface Message {
  id?: string; // Optional ID, might be added by backend or generated client-side
  sender: User; // Always include the full sender user object
  message: string; // The content of the message
  timestamp: number; // Unix timestamp (seconds)
  channel_id?: string; // Channel ID might be useful
  type?: string; // For potential future message types or system messages
}

// Represents the structure for typing indicators in PubNub context
export interface TypingUser {
  id: string;
  name: string;
}
