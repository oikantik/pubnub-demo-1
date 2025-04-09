import { useEffect, useRef, useMemo } from "react";
import { usePubNubContext } from "../providers/PubNubProvider";
import { Message } from "../../types"; // Import shared type

// Removed local Message interface definition

interface MessageListProps {
  channelId: string | null;
  messages: Message[];
  currentUserId: string;
}

export function MessageList({
  channelId,
  messages,
  currentUserId,
}: MessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { typingUsers } = usePubNubContext();

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Get typing users for current channel with validation
  const currentTypingUsers = useMemo(() => {
    if (!channelId || !typingUsers || !typingUsers[channelId]) {
      return [];
    }

    // Filter to ensure all objects have valid properties
    return typingUsers[channelId].filter(
      (user) => user && user.id && user.name
    );
  }, [channelId, typingUsers]);

  const formatTime = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Deduplicate messages by content and sender ID
  const deduplicatedMessages = messages.reduce((unique: Message[], message) => {
    // Check if this message (by content+sender+timestamp within 2 seconds) is already in our unique list
    const isDuplicate = unique.some(
      (m) =>
        m.message === message.message && // Use m.message
        m.sender.id === message.sender.id && // Use m.sender.id
        Math.abs(m.timestamp - message.timestamp) < 2
    );

    if (!isDuplicate) {
      unique.push(message);
    }

    return unique;
  }, []);

  // Format typing indicator text
  const formatTypingIndicator = () => {
    if (!currentTypingUsers || currentTypingUsers.length === 0) {
      return "";
    }

    // Extra safety validation for malformed typing user objects
    const validTypers = currentTypingUsers;

    if (validTypers.length === 0) {
      return "";
    }

    if (validTypers.length === 1) {
      const typer = validTypers[0];
      return `${typer.name} is typing...`;
    } else if (validTypers.length === 2) {
      return `${validTypers[0].name} and ${validTypers[1].name} are typing...`;
    } else {
      return `${validTypers.length} people are typing...`;
    }
  };

  // Show typing indicators as React elements instead of just text for better control
  const renderTypingIndicator = () => {
    const typingText = formatTypingIndicator();
    if (!typingText) {
      return null;
    }

    return (
      <div className="flex items-center text-muted-foreground text-sm mb-2">
        <div className="flex space-x-1 mr-2">
          <div
            className="w-2 h-2 rounded-full bg-primary animate-bounce"
            style={{ animationDelay: "0ms" }}
          ></div>
          <div
            className="w-2 h-2 rounded-full bg-primary animate-bounce"
            style={{ animationDelay: "300ms" }}
          ></div>
          <div
            className="w-2 h-2 rounded-full bg-primary animate-bounce"
            style={{ animationDelay: "600ms" }}
          ></div>
        </div>
        <span>{typingText}</span>
      </div>
    );
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {deduplicatedMessages.length === 0 ? (
        <div className="flex items-center justify-center h-full">
          <p className="text-muted-foreground">
            No messages yet. Start the conversation!
          </p>
        </div>
      ) : (
        <>
          {deduplicatedMessages.map((message, index) => {
            // Check sender using sender object ID
            const isCurrentUser = message.sender.id === currentUserId;

            return (
              <div
                key={
                  message.id ||
                  `${message.sender.id}-${message.timestamp}-${index}` // Use sender.id in key
                }
                className={`flex ${
                  isCurrentUser ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`max-w-[80%] rounded-lg px-4 py-2 ${
                    isCurrentUser
                      ? "bg-black text-white"
                      : "bg-gray-100 text-black"
                  }`}
                >
                  {!isCurrentUser && (
                    <div className="font-bold text-xs text-black mb-1">
                      {message.sender.name} {/* Display sender name */}
                    </div>
                  )}
                  <div className="break-words">{message.message}</div>{" "}
                  {/* Display message content */}
                  <div className="text-xs opacity-70 text-right mt-1">
                    {formatTime(message.timestamp)}
                  </div>
                </div>
              </div>
            );
          })}
        </>
      )}

      {/* Typing indicator */}
      {currentTypingUsers.length > 0 && (
        <div className="mt-2 mb-1">{renderTypingIndicator()}</div>
      )}

      {/* Invisible element for scrolling to bottom */}
      <div ref={messagesEndRef} />
    </div>
  );
}
