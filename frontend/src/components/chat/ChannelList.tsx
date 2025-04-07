import { Button } from "../ui/button";
import { usePubNubContext } from "../providers/PubNubProvider";

interface Channel {
  id: string;
  name: string;
  joined?: boolean;
}

interface MyChannelsListProps {
  channels: Channel[];
  currentChannelId: string | null;
  onSelectChannel: (channelId: string) => void;
}

export function MyChannelsList({
  channels,
  currentChannelId,
  onSelectChannel,
}: MyChannelsListProps) {
  const { presence } = usePubNubContext();

  // Filter to only joined channels
  const myChannels = channels.filter((channel) => channel.joined === true);

  if (myChannels.length === 0) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        No joined channels available
      </div>
    );
  }

  return (
    <div className="space-y-1 p-2">
      {myChannels.map((channel) => {
        const isActive = channel.id === currentChannelId;
        const occupancy = presence[channel.id] || 0;

        return (
          <div
            key={channel.id}
            className={`flex items-center rounded-md px-3 py-2 transition-colors cursor-pointer ${
              isActive ? "bg-primary/10 text-primary" : "hover:bg-secondary"
            }`}
            onClick={() => onSelectChannel(channel.id)}
          >
            <div className="flex flex-col">
              <div className="font-medium truncate max-w-[180px]">
                {channel.name}
              </div>
              <div className="text-xs text-muted-foreground">
                {occupancy} {occupancy === 1 ? "member" : "members"}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface OtherChannelsListProps {
  channels: Channel[];
  onJoinChannel: (channel: Channel) => void;
}

export function OtherChannelsList({
  channels,
  onJoinChannel,
}: OtherChannelsListProps) {
  const { presence } = usePubNubContext();

  // Filter to only non-joined channels
  const otherChannels = channels.filter((channel) => channel.joined === false);
  console.log("otherChannels", channels, otherChannels);

  if (otherChannels.length === 0) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        No other channels available
      </div>
    );
  }

  return (
    <div className="space-y-1 p-2">
      {otherChannels.map((channel) => {
        const occupancy = presence[channel.id] || 0;

        return (
          <div
            key={channel.id}
            className="flex items-center justify-between rounded-md px-3 py-2"
          >
            <div className="flex flex-col opacity-80">
              <div className="font-medium truncate max-w-[120px]">
                {channel.name}
              </div>
              <div className="text-xs text-muted-foreground">
                {occupancy} {occupancy === 1 ? "member" : "members"}
              </div>
            </div>
            <Button
              variant="default"
              size="sm"
              className="ml-2 h-8"
              onClick={() => onJoinChannel(channel)}
            >
              Join
            </Button>
          </div>
        );
      })}
    </div>
  );
}

// Main ChannelList component that handles both joined and other channels
interface ChannelListProps {
  channels: Channel[];
  currentChannelId: string | null;
  onSelectChannel: (channelId: string) => void;
  onJoinChannel: (channel: Channel) => void;
}

export function ChannelList({
  channels,
  currentChannelId,
  onSelectChannel,
  onJoinChannel,
}: ChannelListProps) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="px-4 py-2 font-medium text-sm">My Channels</h3>
        <MyChannelsList
          channels={channels}
          currentChannelId={currentChannelId}
          onSelectChannel={onSelectChannel}
        />
      </div>

      <div>
        <h3 className="px-4 py-2 font-medium text-sm border-t">
          Other Channels
        </h3>
        <OtherChannelsList channels={channels} onJoinChannel={onJoinChannel} />
      </div>
    </div>
  );
}
