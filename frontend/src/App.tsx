import React, { useState, useEffect } from "react";
import "./App.css";
import { PubNubProvider } from "pubnub-react";
import PubNub from "pubnub";
import Chat from "./components/Chat";
import "./components/Chat.css";

const API_URL = "http://localhost:9292/v1";

function App() {
  const [userId, setUserId] = useState<string | undefined>();
  const [userName, setUserName] = useState<string | undefined>();
  const [authToken, setAuthToken] = useState<string | undefined>();
  const [pubnubToken, setPubnubToken] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [loginInput, setLoginInput] = useState("");

  // Check for auth token in localStorage on app load
  useEffect(() => {
    const storedToken = localStorage.getItem("authToken");
    if (storedToken) {
      fetchUserInfo(storedToken);
    } else {
      setLoading(false);
    }
  }, []);

  const fetchUserInfo = async (token: string) => {
    try {
      const response = await fetch(`${API_URL}/users/me`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const userData = await response.json();
        setUserId(userData.id);
        setUserName(userData.name);
        setAuthToken(token);
        setLoading(false);
      } else {
        // Token is invalid, clear it
        localStorage.removeItem("authToken");
        setLoading(false);
      }
    } catch (error) {
      console.error("Error fetching user info:", error);
      localStorage.removeItem("authToken");
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginInput.trim()) return;

    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/users/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: loginInput }),
      });

      if (response.ok) {
        const data = await response.json();
        console.log("Login successful, received data:", {
          id: data.id,
          name: data.name,
          hasToken: !!data.token,
          hasPubNubToken: !!data.pubnub_token,
        });

        setUserId(data.id);
        setUserName(data.name);
        setAuthToken(data.token);
        setPubnubToken(data.pubnub_token);

        // Store token for later
        localStorage.setItem("authToken", data.token);
      } else {
        console.error("Login failed with status:", response.status);
        alert("Login failed");
      }
    } catch (error) {
      console.error("Login error:", error);
      alert("Login failed due to a network error");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    if (authToken) {
      try {
        await fetch(`${API_URL}/users/logout`, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        });
      } catch (error) {
        console.error("Logout error:", error);
      }
    }

    // Clear local state
    setUserId(undefined);
    setUserName(undefined);
    setAuthToken(undefined);
    setPubnubToken(undefined);
    localStorage.removeItem("authToken");
  };

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  if (!userId || !authToken) {
    return (
      <div className="login-container">
        <h1>PubNub Chat</h1>
        <form onSubmit={handleLogin} className="login-form">
          <input
            type="text"
            value={loginInput}
            onChange={(e) => setLoginInput(e.target.value)}
            placeholder="Enter your name"
            required
          />
          <button type="submit">Login</button>
        </form>
      </div>
    );
  }

  // Create PubNub client configuration
  const publishKey = import.meta.env.VITE_PUBNUB_PUBLISH_KEY;
  const subscribeKey = import.meta.env.VITE_PUBNUB_SUBSCRIBE_KEY;

  // Log for debugging
  console.log("PubNub configuration:", {
    publishKeyExists: !!publishKey,
    subscribeKeyExists: !!subscribeKey,
    userIdExists: !!userId,
    pubnubTokenExists: !!pubnubToken,
  });

  const pubnubConfig = {
    publishKey,
    subscribeKey,
    uuid: userId,
    authKey: pubnubToken,
  };

  return (
    <PubNubProvider client={new PubNub(pubnubConfig)}>
      <div className="app">
        <header>
          <h1>PubNub Chat</h1>
          <div className="user-info">
            <span>Welcome, {userName}</span>
            <button onClick={handleLogout} className="logout-button">
              Logout
            </button>
          </div>
        </header>
        <Chat userId={userId} authToken={authToken} />
      </div>
    </PubNubProvider>
  );
}

export default App;
