import React, { useState } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { PlusCircle } from "lucide-react";

interface CreateChannelProps {
  onCreateChannel: (name: string) => Promise<void>;
}

export function CreateChannel({ onCreateChannel }: CreateChannelProps) {
  const [channelName, setChannelName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [isFormVisible, setIsFormVisible] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!channelName.trim()) return;

    setIsCreating(true);

    try {
      await onCreateChannel(channelName.trim());
      setChannelName("");
      setIsFormVisible(false);
    } catch (error) {
      console.error("Failed to create channel:", error);
    } finally {
      setIsCreating(false);
    }
  };

  if (!isFormVisible) {
    return (
      <Button
        variant="ghost"
        className="w-full justify-start mb-2"
        onClick={() => setIsFormVisible(true)}
      >
        <PlusCircle className="mr-2 h-4 w-4" />
        Create Channel
      </Button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="p-2 mb-2 space-y-2">
      <Input
        value={channelName}
        onChange={(e) => setChannelName(e.target.value)}
        placeholder="Channel name"
        disabled={isCreating}
        autoFocus
      />
      <div className="flex space-x-2">
        <Button
          type="submit"
          disabled={!channelName.trim() || isCreating}
          size="sm"
        >
          {isCreating ? "Creating..." : "Create"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setIsFormVisible(false);
            setChannelName("");
          }}
          disabled={isCreating}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
