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
*   Uses Tailwind CSS for styling.
*   Handles routing with React Router.

### Key Components & Logic

*   **`src/App.tsx`:** Main application component. Manages auth state (via `localStorage`), routing, and top-level layout.
*   **`src/lib/api.ts`:** Axios-based client for interacting with the backend API. Includes an interceptor to automatically add the `Authorization: Bearer <token>` header.
*   **`src/components/auth/LoginForm.tsx`:** Handles user login UI and API call.
*   **`src/components/chat/ChatLayout.tsx`:** Main chat interface, likely containing channel list, message display, message input, etc.
*   **`src/components/providers/PubNubProvider.tsx`:** Manages the PubNub SDK instance, connection, and subscriptions, using the token fetched from the API.

### Frontend Flow

1.  **Load:** Check `localStorage` for token.
2.  **No Token:** Show `LoginForm`.
3.  **Login:** User submits name -> `POST /v1/users/login` -> Get token & user info -> Save to `localStorage`.
4.  **Authenticated:** Show `ChatLayout`.
5.  **Chat Init:** Fetch channels (`GET /v1/channels`), fetch PubNub token (`POST /v1/tokens/pubnub`), initialize PubNub.
6.  **Channel Select:** Fetch history (`GET /v1/channels/:id/history`), fetch presence (`GET /v1/channels/:id/presence`), subscribe to PubNub channel.
7.  **Send Message:** `POST /v1/messages` -> API saves & broadcasts via PubNub.
8.  **Receive Message:** Frontend gets message via PubNub subscription.
9.  **Logout:** `DELETE /v1/users/logout` -> Clear `localStorage` -> Show `LoginForm`.

---

*This summary was generated based on code analysis on Apr 08, 2024.* 