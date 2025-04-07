import React, { useState, useEffect } from "react";
import PubNub from "pubnub";
import { PubNubProvider } from "pubnub-react";
import Login from "./components/Login.tsx";
import Chat from "./components/Chat.tsx";
import { Container, Navbar, Button } from "react-bootstrap";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:9292";

function App() {
  const [userId, setUserId] = useState<string | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [pubnub, setPubnub] = useState<PubNub | null>(null);

  // Set up PubNub instance when user logs in
  useEffect(() => {
    if (userId && authToken) {
      const pubNubClient = new PubNub({
        publishKey: "demo",
        subscribeKey: "demo",
        userId,
      });

      setPubnub(pubNubClient);

      return () => {
        // Cleanup PubNub when unmounting
        pubNubClient.unsubscribeAll();
      };
    }
  }, [userId, authToken]);

  const handleLogin = (userId: string, token: string) => {
    setUserId(userId);
    setAuthToken(token);
    localStorage.setItem("userId", userId);
    localStorage.setItem("authToken", token);
  };

  const handleLogout = () => {
    if (pubnub) {
      pubnub.unsubscribeAll();
    }
    setUserId(null);
    setAuthToken(null);
    setPubnub(null);
    localStorage.removeItem("userId");
    localStorage.removeItem("authToken");
  };

  // Check for saved auth on page load
  useEffect(() => {
    const savedUserId = localStorage.getItem("userId");
    const savedToken = localStorage.getItem("authToken");

    if (savedUserId && savedToken) {
      setUserId(savedUserId);
      setAuthToken(savedToken);
    }
  }, []);

  return (
    <>
      {userId && authToken && pubnub ? (
        <PubNubProvider client={pubnub}>
          <div className="app-container d-flex flex-column vh-100">
            <Navbar bg="dark" variant="dark" className="p-2">
              <Container fluid>
                <Navbar.Brand style={{ color: "#00a884" }}>
                  WhatsApp Chat
                </Navbar.Brand>
                <Button
                  variant="outline-light"
                  size="sm"
                  onClick={handleLogout}
                >
                  Logout
                </Button>
              </Container>
            </Navbar>
            <div className="flex-grow-1 d-flex">
              <Chat userId={userId} authToken={authToken} />
            </div>
          </div>
        </PubNubProvider>
      ) : (
        <Login onLogin={handleLogin} />
      )}
    </>
  );
}

export default App;
