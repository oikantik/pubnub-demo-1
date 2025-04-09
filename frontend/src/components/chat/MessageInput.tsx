import React, { useEffect, useRef, useState, useCallback } from "react";
import { Textarea } from "../ui/textarea";
import { Button } from "../ui/button";
import { Send } from "lucide-react";
import { usePubNubContext } from "../providers/PubNubProvider";

interface MessageInputProps {
  channelId: string | null;
  onSendMessage: (message: string) => void;
  disabled?: boolean;
}

export function MessageInput({
  channelId,
  onSendMessage,
  disabled = false,
}: MessageInputProps) {
  const [message, setMessage] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { startTyping, stopTyping, currentUserName } = usePubNubContext();

  // Typing indicator logic
  const isTypingRef = useRef(false); // Use ref to avoid dependency issues in callbacks
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Centralized function to signal stop typing
  const signalStopTyping = useCallback(() => {
    if (isTypingRef.current && channelId) {
      stopTyping(channelId);
      isTypingRef.current = false; // Update ref immediately
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
    }
  }, [channelId, stopTyping]);

  useEffect(() => {
    // Cleanup on unmount or channel change
    return () => {
      signalStopTyping();
    };
  }, [channelId, signalStopTyping]); // Depend on channelId and the stable callback

  const handleTyping = useCallback(() => {
    // Clear existing timeout before potentially starting
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }

    // Signal start typing if not already typing
    if (!isTypingRef.current && channelId && currentUserName) {
      isTypingRef.current = true;
      startTyping(channelId);
    }

    // Set a new timeout to stop typing
    typingTimeoutRef.current = setTimeout(() => {
      signalStopTyping();
    }, 3000); // Stop typing signal after 3 seconds of inactivity
  }, [channelId, currentUserName, startTyping, signalStopTyping]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value);
    handleTyping();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (message.trim() && !disabled) {
      onSendMessage(message.trim());
      setMessage("");

      // Stop typing indicator immediately when message is sent
      signalStopTyping();

      // Focus back on textarea after sending
      textareaRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Send message on Enter (without Shift)
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (message.trim() && !disabled) {
        handleSubmit(e);
      }
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-2 p-4 border-t">
      <Textarea
        ref={textareaRef}
        value={message}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder="Type a message"
        disabled={disabled || !channelId}
        className="min-h-[60px] max-h-[120px] resize-none focus-visible:ring-1 focus-visible:ring-offset-1"
      />
      <Button
        type="submit"
        variant="default"
        size="icon"
        disabled={!message.trim() || disabled || !channelId}
        className="h-10 w-10"
      >
        <Send className="h-5 w-5" />
      </Button>
    </form>
  );
}
