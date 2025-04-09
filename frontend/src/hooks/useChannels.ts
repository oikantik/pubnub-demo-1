import { useState, useEffect, useCallback } from "react";
import { API } from "../lib/api";
import { Channel } from "../types"; // Import the global Channel type

export function useChannels() {
  const [channels, setChannels] = useState<Channel[]>([]); // Now uses the imported Channel type
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchChannels = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Fetch all available channels - the backend adds the 'joined' flag
      // and hopefully the 'members' count
      const response = await API.getAllChannels();
      setChannels(response.data || []); // Should correctly map if API provides 'members'
    } catch (err: any) {
      console.error("useChannels - Failed to fetch channels:", err);
      setError(err.message || "Failed to load channels");
      setChannels([]); // Clear channels on error
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch channels on initial mount
  useEffect(() => {
    fetchChannels();
  }, [fetchChannels]);

  // Return state and refetch function
  return { channels, isLoading, error, refetchChannels: fetchChannels };
}
