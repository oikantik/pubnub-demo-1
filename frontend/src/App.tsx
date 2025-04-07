import React, { useState, useEffect } from "react";
import { LoginForm } from "./components/auth/LoginForm";
import { ChatLayout } from "./components/chat/ChatLayout";
import { PubNubProvider } from "./components/providers/PubNubProvider";

const App: React.FC = () => {
  const [userId, setUserId] = useState<string | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);

  // Check for saved auth on load
  useEffect(() => {
    try {
      const savedUserId = localStorage.getItem("userId");
      const savedToken = localStorage.getItem("authToken");

      if (savedUserId && savedToken) {
        setUserId(savedUserId);
        setAuthToken(savedToken);
      }
    } catch (e) {
      console.error("Error reading from localStorage:", e);
    } finally {
      // Mark initialization as complete regardless of outcome
      setInitialized(true);
    }
  }, []);

  // Handle user login
  const handleLogin = (userId: string, token: string) => {
    setUserId(userId);
    setAuthToken(token);

    // Save to localStorage for persistence
    try {
      localStorage.setItem("userId", userId);
      localStorage.setItem("authToken", token);
    } catch (e) {
      console.error("Error saving to localStorage:", e);
    }
  };

  // Handle user logout
  const handleLogout = () => {
    setUserId(null);
    setAuthToken(null);

    // Clear saved auth
    try {
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
    <PubNubProvider userId={userId || undefined}>
      {userId && authToken ? (
        <ChatLayout userId={userId} onLogout={handleLogout} />
      ) : (
        <LoginForm onLogin={handleLogin} />
      )}
    </PubNubProvider>
  );
};

export default App;
