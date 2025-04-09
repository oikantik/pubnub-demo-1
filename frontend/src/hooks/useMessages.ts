import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { API } from "../lib/api";
import { Message } from "../types";
import { usePubNub } from "../components/providers/PubNubProvider";

export function useMessages(channelId: string | null) {
  const [historyMessages, setHistoryMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const historyMessageIds = useRef(new Set<string>());

  const { messagesByChannel } = usePubNub();
  const realTimeMessages = useMemo(() => {
    return messagesByChannel[channelId || ""] || [];
  }, [messagesByChannel, channelId]);

  const fetchHistory = useCallback(async () => {
    if (!channelId) {
      setHistoryMessages([]);
      historyMessageIds.current.clear();
      return;
    }

    setIsLoading(true);
    setError(null);
    historyMessageIds.current.clear();

    try {
      const response = await API.getChannelMessages(channelId);
      const fetchedHistory: Message[] = response.data || [];
      setHistoryMessages(fetchedHistory);
      fetchedHistory.forEach((msg) => {
        const messageId = msg.id || `${msg.sender.id}-${msg.timestamp}`;
        historyMessageIds.current.add(messageId);
      });
    } catch (err: any) {
      console.error(`useMessages - Failed fetch for ${channelId}:`, err);
      setError(err.message || "Failed to load history");
      setHistoryMessages([]);
    } finally {
      setIsLoading(false);
    }
  }, [channelId]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const mergedMessages = useMemo(() => {
    const uniqueRealTimeMessages = realTimeMessages.filter((rtMsg) => {
      const messageId = rtMsg.id || `${rtMsg.sender.id}-${rtMsg.timestamp}`;
      return !historyMessageIds.current.has(messageId);
    });

    const combined = [...historyMessages, ...uniqueRealTimeMessages];

    combined.sort((a, b) => a.timestamp - b.timestamp);

    return combined;
  }, [historyMessages, realTimeMessages]);

  return {
    messages: mergedMessages,
    isLoading,
    error,
    refetchHistory: fetchHistory,
  };
}
