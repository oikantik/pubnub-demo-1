# Project Overview

This document provides a summary of the PubNub Demo project architecture, backend API, and frontend application. It should be kept up-to-date as the project evolves.

## Architecture

*   **Client-Server:** A Ruby/Grape API backend serves a React/TypeScript frontend.
*   **Containerization:** Both backend and frontend run in Docker containers, managed by `docker-compose.yml`.
*   **Real-time:** PubNub is used for real-time messaging and presence features.
*   **Authentication:** Token-based authentication managed by the API.

## Backend API (Ruby/Grape)

*   Located in the `api/` directory.
*   Built with the Grape framework.
*   Uses Redis for token-to-user mapping (`api/lib/chat/services/redis.rb`) and caching PubNub PAM tokens.
*   Likely uses a database (structure suggested by `api/db/` and `api/lib/chat/models/`).
*   Exposes RESTful endpoints under the `/v1/` path prefix.
*   Provides Swagger documentation at `/docs`.

### PubNub Service (`api/lib/chat/services/pubnub.rb`)

*   Manages interactions with PubNub for real-time features and access control (PAM v3).
*   Uses two distinct client types:
    *   `pubnub_client_for_access_management`: Initialized with the **Secret Key**. Used *only* for administrative tasks like granting PAM tokens (`grant_token`).
    *   `pubnub_client_for_user(user_id)`: Initialized with Pub/Sub keys and a specific `user_id`. Used for server-side operations performed on behalf of a user.
*   **Token Handling (PAM v3):**
    *   When performing actions like `publish` or `presence_on_channel` (here_now check):
        1.  The user's specific PAM token is fetched from Redis cache.
        2.  A client instance is obtained via `pubnub_client_for_user(user_id)`.
        3.  The fetched token is dynamically applied to this client instance using `client.set_token(user_pam_token)`.
        4.  The PubNub operation (e.g., `publish`, `here_now`) is performed.
        5.  The token is cleared from the client instance using `client.set_token(nil)`.

### API Routes (`/v1/`)

**Authentication & User Management (`/users`)**

*   `POST /users/login`: Body: `{ "name": "username" }`. Login or create user. Returns user details & auth `token`.
*   `GET /users/me` (Auth Required): Get current user details.
*   `DELETE /users/logout` (Auth Required): Logout current user.

**Channel Management (`/channels`)** (All require Auth)

*   `POST /channels`: Body: `{ "name": "channel_name", "description": "optional_desc" }`. Create a channel.
*   `GET /channels`: Get list of all channels, indicating user membership (`joined` flag).
*   `GET /channels/:id`: Get details for a specific channel (membership required).
*   `POST /channels/:id/join`: Join a channel.
*   `GET /channels/:id/history`: Get message history (membership required). Query param: `limit` (default 50).
*   `GET /channels/:id/presence`: Get list of user UUIDs present in the channel via PubNub (membership required).

**Messaging (`/messages`)** (Auth Required)

*   `POST /messages`: Body: `{ "channel_id": "id_or_name", "text": "message_text" }`. Send a message (membership required).

**Tokens (`/tokens`)** (Auth Required)

*   `POST /tokens/pubnub`: Generate a PubNub access token for the current user.

**Utility (`/ping`)**

*   `GET /ping`: Health check. Returns `{ "ping": "pong" }`.

## Frontend (React/TypeScript)

*   Located in the `frontend/` directory.
*   Built with React, TypeScript, and Vite.
*   Uses Tailwind CSS for styling (`index.css`, `tailwind.config.js`), assisted by `clsx` and `tailwind-merge` via `lib/utils.ts` (`cn` function).
*   Handles routing with `react-router-dom`.

### Key Components & Logic

*   **`src/main.tsx`**: Standard React entry point, renders `<App />`.
*   **`src/App.tsx`**: Top-level component.
    *   Manages core app state: `userId`, `authToken` (app token), `userName`, `initialized` status.
    *   Handles routing logic (`BrowserRouter`, `Routes`, `Route`).
    *   Persists/restores `userId` and `authToken` using `localStorage`.
    *   Conditionally renders `LoginForm` or `ChatLayout` based on auth state.
    *   Fetches user info (`API.getUserInfo`) on load/login.
    *   Wraps routes in `PubNubProvider`.
*   **`src/lib/api.ts`**: Defines static `API` class using `axios`.
    *   Configures `baseURL` via `VITE_API_URL` (default: `http://localhost:9292`).
    *   Includes an interceptor to automatically add `Authorization: Bearer <app_auth_token>` header from `localStorage`.
    *   Provides methods mapping to backend API endpoints (login, logout, channels, messages, getPubnubToken).
*   **`src/lib/pubnub-client.ts`**: Singleton wrapper around PubNub JS SDK.
    *   Handles initialization (`initialize`), fetching the PubNub PAM token (`API.getPubnubToken`), and applying it (`setToken`).
    *   Manages subscriptions (`subscribe`, `unsubscribe`), listener setup (`setupListeners`), and cleanup.
    *   Provides methods for sending typing indicators (`sendTypingStart`, `sendTypingEnd`) via PubNub signals.
    *   Parses incoming messages to differentiate between regular messages and typing signals.
*   **`src/components/providers/PubNubProvider.tsx`**: React Context provider for PubNub.
    *   Uses `pubnub-client.ts` singleton.
    *   Initializes PubNub when `userId` is available.
    *   Manages state for PubNub connection status, typing users (`typingUsers`), and presence counts (`presence`).
    *   Sets up listeners via `pubnubClient.setupListeners`, updating its state based on events.
    *   Provides `usePubNub` hook for components to access state and interaction methods (`startTyping`, `stopTyping`, `subscribeTo`, etc.).
*   **`src/components/auth/LoginForm.tsx`**: Renders login form, calls `API.login`, and invokes `onLogin` prop (from `App.tsx`) on success.
*   **`src/components/ui/`**: Basic UI components (Button, Card, Input, Textarea) using Tailwind CSS, likely from shadcn/ui.
*   **`src/components/chat/ChatLayout.tsx`**: Main authenticated UI.
    *   Orchestrates channel and message components.
    *   Fetches channel list (`API.getAllChannels`) and message history (`API.getChannelMessages`).
    *   Manages `currentChannelId` state based on route params (`useParams`) or selection.
    *   Handles channel selection, joining (`API.joinChannel`), creation (`API.createChannel`), and message sending (`API.sendMessage`).
    *   Sets up PubNub listeners for *incoming messages* on the current channel via `pubnubClient.setupListeners`.
    *   Subscribes/unsubscribes to channels via `pubnubClient` as the current channel changes.
    *   Renders sidebar (with `ChannelList`, `CreateChannel`) and main content area (with `MessageList`, `MessageInput`).
*   **`src/components/chat/ChannelList.tsx`**: Displays joined and other channels, using presence data from `usePubNubContext`. Handles selection/joining via props.
*   **`src/components/chat/CreateChannel.tsx`**: Form for creating a new channel, calls `onCreateChannel` prop.
*   **`src/components/chat/MessageList.tsx`**: Displays messages for the current channel. Renders typing indicators based on `typingUsers` from `usePubNubContext`. Handles auto-scrolling.
*   **`src/components/chat/MessageInput.tsx`**: Textarea for inputting messages. Handles sending typing indicators (`startTyping`/`stopTyping` from context) and calls `onSendMessage` prop on submit.

### Frontend Flow (Detailed)

1.  **Load:** `App.tsx` checks `localStorage` for `authToken`.
2.  **No Token:** `LoginForm` shown. User enters name -> `API.login` -> `App.tsx` receives `userId`, `authToken`, `name` -> Saves to `localStorage`.
3.  **Auth State Change:** `App.tsx` renders `PubNubProvider` and `ChatLayout`.
4.  **PubNub Init:** `PubNubProvider` detects `userId` -> calls `pubnubClient.initialize(userId)`.
5.  **Token Fetch:** `pubnubClient.initialize` calls `API.getPubnubToken()` -> Backend returns PubNub PAM token.
6.  **SDK Setup:** `pubnubClient` initializes PubNub SDK, applies token (`setToken`), sets up *global* listeners (for typing/presence via `PubNubProvider` callbacks).
7.  **Chat Layout Mount:** `ChatLayout` mounts -> calls `fetchChannels()` -> `API.getAllChannels` -> populates `channels` state. Selects initial channel (route param or first joined).
8.  **Channel Change/Select:** `useEffect` in `ChatLayout` runs:
    *   Unsubscribes from old channel (`pubnubClient.unsubscribe`).
    *   Removes old message listener.
    *   Fetches history: `API.getChannelMessages(newChannelId)` -> Updates `messages` state.
    *   Subscribes to new channel: `pubnubClient.subscribe([newChannelId])`.
    *   Sets up new listener: `pubnubClient.setupListeners({ onMessage: ... })` for incoming messages on this specific channel.
    *   Updates URL via `navigate`.
9.  **Typing:** User types in `MessageInput` -> `handleTyping` -> `usePubNubContext().startTyping` -> `pubnubClient.sendTypingStart` -> Publishes typing signal.
10. **Send Message:** User submits `MessageInput` -> `handleSendMessage` -> `API.sendMessage` -> Backend saves message & likely broadcasts via PubNub.
11. **Receive Message:** PubNub message arrives -> `onMessage` listener in `ChatLayout` -> Updates `messages` state -> `MessageList` re-renders.
12. **Receive Typing/Presence:** PubNub signal/event arrives -> Global listeners in `PubNubProvider` handle it -> Updates `typingUsers`/`presence` state -> `MessageList`/`ChannelList` re-render via context.
13. **Logout:** Logout button -> `onLogout` prop -> `App.tsx` clears state/`localStorage` -> `LoginForm` rendered.

---

*This summary was generated based on code analysis on Apr 08, 2024.* 