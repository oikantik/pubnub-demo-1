import React, { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { LoginForm } from "./components/auth/LoginForm";
import { ChatLayout } from "./components/chat/ChatLayout";
import { PubNubProvider } from "./components/providers/PubNubProvider";
import { API } from "./lib/api";

const App: React.FC = () => {
  const [userName, setUserName] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);

  // Fetch user info from API
  const fetchUserInfo = async () => {
    try {
      const response = await API.getUserInfo();
      if (response.data && response.data.name) {
        setUserName(response.data.name);
      }
    } catch (error) {
      console.error("Failed to fetch user info:", error);
    }
  };

  // Check for saved auth on load
  useEffect(() => {
    try {
      const savedUserId = localStorage.getItem("userId");
      const savedToken = localStorage.getItem("authToken");

      if (savedUserId && savedToken) {
        setUserId(savedUserId);
        setAuthToken(savedToken);

        // Fetch user info from API
        fetchUserInfo();
      }
    } catch (e) {
      console.error("Error reading from localStorage:", e);
    } finally {
      // Mark initialization as complete regardless of outcome
      setInitialized(true);
    }
  }, []);

  // Handle user login
  const handleLogin = async (userId: string, token: string, name: string) => {
    setUserId(userId);
    setAuthToken(token);

    // Temporarily set the name from login until we fetch from API
    setUserName(name);

    // Save to localStorage for persistence
    try {
      localStorage.setItem("userId", userId);
      localStorage.setItem("authToken", token);

      // Fetch user info from API after login
      await fetchUserInfo();
    } catch (e) {
      console.error("Error saving to localStorage:", e);
    }
  };

  // Handle user logout
  const handleLogout = () => {
    setUserName(null);
    setUserId(null);
    setAuthToken(null);

    // Clear saved auth
    try {
      localStorage.removeItem("userName");
      localStorage.removeItem("userId");
      localStorage.removeItem("authToken");
    } catch (e) {
      console.error("Error removing from localStorage:", e);
    }
  };

  // Loading state
  if (!initialized) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <PubNubProvider userId={userId || undefined}>
        <Routes>
          {userId && authToken ? (
            <>
              <Route
                path="/channel/:channelId"
                element={
                  <ChatLayout
                    userName={userName}
                    userId={userId}
                    onLogout={handleLogout}
                  />
                }
              />
              <Route
                path="/"
                element={
                  <ChatLayout
                    userName={userName}
                    userId={userId}
                    onLogout={handleLogout}
                  />
                }
              />
            </>
          ) : (
            <>
              <Route path="/" element={<LoginForm onLogin={handleLogin} />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </>
          )}
        </Routes>
      </PubNubProvider>
    </BrowserRouter>
  );
};

export default App;
