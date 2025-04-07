import { Button } from "../ui/button";
import { usePubNubContext } from "../providers/PubNubProvider";

interface Channel {
  id: string;
  name: string;
  joined?: boolean;
}

interface ChannelListProps {
  channels: Channel[];
  currentChannelId: string | null;
  onSelectChannel: (channelId: string) => void;
  onJoinChannel?: (channel: Channel) => void;
}

export function ChannelList({
  channels,
  currentChannelId,
  onSelectChannel,
  onJoinChannel,
}: ChannelListProps) {
  const { presence } = usePubNubContext();

  if (channels.length === 0) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        No channels available
      </div>
    );
  }

  return (
    <div className="space-y-1 p-2">
      {channels.map((channel) => {
        const isActive = channel.id === currentChannelId;
        const occupancy = presence[channel.id] || 0;

        return (
          <div
            key={channel.id}
            className={`flex items-center justify-between rounded-md px-3 py-2 cursor-pointer hover:bg-secondary transition-colors ${
              isActive ? "bg-secondary" : ""
            }`}
            onClick={() =>
              channel.joined ? onSelectChannel(channel.id) : undefined
            }
          >
            <div className="flex flex-col">
              <div className="font-medium">{channel.name}</div>
              <div className="text-xs text-muted-foreground">
                {occupancy} {occupancy === 1 ? "member" : "members"}
              </div>
            </div>

            {!channel.joined && onJoinChannel && (
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onJoinChannel(channel);
                }}
              >
                Join
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}
