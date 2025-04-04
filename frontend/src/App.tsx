import React, { useState, useEffect } from "react";
import "./App.css";
import { PubNubProvider } from "pubnub-react";
import PubNub from "pubnub";
import Chat from "./components/Chat";
import "./components/Chat.css";
import Login from "./components/Login";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:9292";

interface User {
  id: string;
  name: string;
  token: string;
  pubnub_token: string;
}

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [pubnubClient, setPubnubClient] = useState<PubNub | null>(null);

  // Load user session on initial load
  useEffect(() => {
    const storedUser = localStorage.getItem("user");
    const storedToken = localStorage.getItem("authToken");
    const storedPubNubToken = localStorage.getItem("pubnubToken");

    if (storedUser && storedToken && storedPubNubToken) {
      console.log("Found stored session, initializing...");
      const parsedUser = JSON.parse(storedUser);
      setUser(parsedUser);
      setAuthToken(storedToken);

      // Initialize PubNub client with stored token
      initializePubNub(parsedUser.id, storedPubNubToken);
    }
  }, []);

  // Initialize PubNub client with user info and token
  const initializePubNub = (userId: string, token: string) => {
    console.log(`Initializing PubNub client for user: ${userId} with token`);

    const pubNubKeys = {
      publishKey: import.meta.env.VITE_PUBNUB_PUBLISH_KEY,
      subscribeKey: import.meta.env.VITE_PUBNUB_SUBSCRIBE_KEY,
    };

    console.log("PubNub Keys:", {
      publishKey: pubNubKeys.publishKey ? "Configured" : "Missing",
      subscribeKey: pubNubKeys.subscribeKey ? "Configured" : "Missing",
    });

    const client = new PubNub({
      publishKey: pubNubKeys.publishKey,
      subscribeKey: pubNubKeys.subscribeKey,
      userId: userId,
      authKey: token,
    });

    setPubnubClient(client);
    console.log("PubNub client initialized");
  };

  // Handle login form submission
  const handleLogin = async (username: string) => {
    try {
      console.log(`Logging in user: ${username}`);
      const response = await fetch(`${API_URL}/v1/users/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: username }),
      });

      if (!response.ok) {
        console.error("Login failed:", response.status);
        const errorText = await response.text();
        console.error("Error details:", errorText);
        return;
      }

      const userData = await response.json();
      console.log("Login successful:", userData);

      // Validate that we have required data
      if (!userData.id || !userData.token || !userData.pubnub_token) {
        console.error("Invalid user data:", userData);
        return;
      }

      // Store user info and tokens in local storage for persistence
      localStorage.setItem("user", JSON.stringify(userData));
      localStorage.setItem("authToken", userData.token);
      localStorage.setItem("pubnubToken", userData.pubnub_token);

      // Update state
      setUser(userData);
      setAuthToken(userData.token);

      // Initialize PubNub with the token provided by the server
      initializePubNub(userData.id, userData.pubnub_token);
    } catch (error) {
      console.error("Error during login:", error);
    }
  };

  // Handle user logout
  const handleLogout = async () => {
    try {
      if (authToken) {
        console.log("Logging out user");
        await fetch(`${API_URL}/v1/users/logout`, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        });
      }

      // Clear local storage
      localStorage.removeItem("user");
      localStorage.removeItem("authToken");
      localStorage.removeItem("pubnubToken");

      // Clear state
      setUser(null);
      setAuthToken(null);
      setPubnubClient(null);
    } catch (error) {
      console.error("Error during logout:", error);
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>PubNub Chat Demo</h1>
        {user && (
          <div className="user-info">
            <span>Logged in as {user.name}</span>
            <button onClick={handleLogout} className="logout-button">
              Logout
            </button>
          </div>
        )}
      </header>

      <main>
        {!user || !authToken || !pubnubClient ? (
          <Login onLogin={handleLogin} />
        ) : (
          <PubNubProvider client={pubnubClient}>
            <Chat userId={user.id} authToken={authToken} />
          </PubNubProvider>
        )}
      </main>
    </div>
  );
};

export default App;
