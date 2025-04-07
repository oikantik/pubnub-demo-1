import { useEffect, useRef } from "react";
import { usePubNubContext } from "../providers/PubNubProvider";

interface Message {
  id?: string;
  sender: string;
  content: string;
  timestamp: number;
  type?: string;
}

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

  // Get typing users for current channel
  const currentTypingUsers = channelId ? typingUsers[channelId] || [] : [];

  const formatTime = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {messages.length === 0 ? (
        <div className="flex items-center justify-center h-full">
          <p className="text-muted-foreground">
            No messages yet. Start the conversation!
          </p>
        </div>
      ) : (
        <>
          {messages.map((message, index) => {
            const isCurrentUser = message.sender === currentUserId;

            return (
              <div
                key={
                  message.id ||
                  `${message.sender}-${message.timestamp}-${index}`
                }
                className={`flex ${
                  isCurrentUser ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`max-w-[80%] rounded-lg px-4 py-2 ${
                    isCurrentUser
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary"
                  }`}
                >
                  {!isCurrentUser && (
                    <div className="font-semibold text-sm mb-1">
                      {message.sender}
                    </div>
                  )}
                  <div className="break-words">{message.content}</div>
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
        <div className="flex items-center text-muted-foreground text-sm">
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
          <span>
            {currentTypingUsers.length === 1
              ? `${currentTypingUsers[0]} is typing...`
              : `${currentTypingUsers.length} people are typing...`}
          </span>
        </div>
      )}

      {/* Invisible element for scrolling to bottom */}
      <div ref={messagesEndRef} />
    </div>
  );
}
