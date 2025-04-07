import React, { useEffect, useRef, useState } from "react";
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
  const { startTyping, stopTyping } = usePubNubContext();

  // Typing indicator logic
  const [isTyping, setIsTyping] = useState(false);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      // Clean up typing timeout
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }

      // Signal typing stop on unmount if needed
      if (isTyping && channelId) {
        stopTyping(channelId);
      }
    };
  }, [channelId, isTyping, stopTyping]);

  const handleTyping = () => {
    if (!isTyping && channelId) {
      setIsTyping(true);
      startTyping(channelId);
    }

    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Set a new timeout to stop typing
    typingTimeoutRef.current = setTimeout(() => {
      if (channelId) {
        stopTyping(channelId);
        setIsTyping(false);
      }
    }, 3000); // Stop typing signal after 3 seconds of inactivity
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value);
    handleTyping();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (message.trim() && !disabled) {
      onSendMessage(message.trim());
      setMessage("");

      // Stop typing indicator when message is sent
      if (isTyping && channelId) {
        stopTyping(channelId);
        setIsTyping(false);
      }

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
        className="min-h-[60px] max-h-[120px] resize-none"
      />
      <Button
        type="submit"
        size="icon"
        disabled={!message.trim() || disabled || !channelId}
      >
        <Send className="h-5 w-5" />
      </Button>
    </form>
  );
}
