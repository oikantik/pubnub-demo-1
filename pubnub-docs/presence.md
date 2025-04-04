# PubNub Presence

Presence is a feature that shows which users or devices are currently online and connected to a PubNub channel. It enables a variety of real-time use cases like:

- Displaying online/offline status of users in a chat application
- Showing typing indicators
- Tracking how many users are in a specific channel
- Detecting when users join or leave a channel

## How Presence Works

When a client subscribes to a channel with presence enabled, PubNub automatically tracks its connection status and sends presence events to all subscribers of that channel. These events include:

- **Join**: A new client has subscribed to the channel
- **Leave**: A client has unsubscribed or disconnected from the channel
- **Timeout**: A client has gone offline without explicitly unsubscribing
- **State Change**: A client has updated its presence state

## Enabling Presence

To enable presence, you need to:

1. Subscribe to a channel with presence enabled
2. Listen for presence events

### Ruby Example

```ruby
# Subscribe with presence
pubnub.subscribe(
  channels: ['my-channel'],
  with_presence: true
)

# Listen for presence events
pubnub.add_listener(
  callback: lambda do |envelope|
    if envelope.is_a?(Pubnub::Envelope::Presence)
      # Handle presence event
      event = envelope.result[:data]
      puts "Presence event: #{event[:action]}"
      puts "Channel: #{event[:channel]}"
      puts "UUID: #{event[:uuid]}"
      puts "Occupancy: #{event[:occupancy]}"
    end
  end
)
```

## Presence State

You can associate custom state information with a user's presence. This is useful for sharing additional information about a user's status, such as:

- Custom status message ("Away", "Do not disturb")
- User activity ("Typing", "Idle")
- Device information or user preferences

### Setting Presence State

```ruby
pubnub.set_state(
  channel: 'my-channel',
  uuid: 'user-123',
  state: {
    status: 'online',
    activity: 'typing',
    custom_field: 'custom value'
  }
)
```

### Getting Presence State

```ruby
result = pubnub.get_state(
  channel: 'my-channel',
  uuid: 'user-123'
)
```

## Retrieving Channel Occupancy

You can check who is currently present in a channel using the `here_now` method:

```ruby
result = pubnub.here_now(
  channel: 'my-channel'
)

# Access occupancy information
occupancy = result.result[:data][:occupancy]
uuids = result.result[:data][:uuids]
```

## Checking a User's Channels

To find out which channels a specific user is subscribed to:

```ruby
result = pubnub.where_now(
  uuid: 'user-123'
)

# Access channel information
channels = result.result[:data][:channels]
```

## Heartbeating

Heartbeating is how PubNub determines whether a client is still connected. The client sends periodic heartbeats to PubNub, and if PubNub doesn't receive a heartbeat within the configured interval, it considers the client disconnected and generates a timeout event.

You can configure the heartbeat interval when initializing the PubNub client:

```ruby
pubnub = Pubnub.new(
  subscribe_key: 'my_subscribe_key',
  publish_key: 'my_publish_key',
  uuid: 'my_uuid',
  heartbeat: 60,  # Heartbeat interval in seconds
  presence_timeout: 120  # How long until a client is considered offline
)
```

## Best Practices for Presence

1. **Set appropriate heartbeat values**: Balance between timely disconnection detection and network overhead.
2. **Use presence state efficiently**: Only include necessary information in presence state to minimize payload size.
3. **Handle presence events robustly**: Account for delayed or out-of-order events.
4. **Consider large channel considerations**: For channels with many users, use pagination with `here_now`.
5. **Implement reconnection logic**: Handle network disruptions gracefully.

## Presence and Access Control

When using [Access Manager](./access-control.md), ensure that clients have the appropriate permissions for presence:

- Subscribing to presence events requires `Read` permission on the presence channel (`channel-pnpres`)
- `here_now` requires `Read` permission on the channel
- `where_now` requires no specific permission
- Setting presence state requires `Read` permission on the channel

## Use Cases for Chat Applications

1. **Online user indicator**: Show which users are currently online in a chat room
2. **Typing indicators**: Use presence state to indicate when a user is typing
3. **Read receipts**: Track when users are active in a channel to infer message delivery
4. **User activity status**: Display custom status like "Away" or "Do Not Disturb"
5. **Channel participant count**: Show how many users are in a channel or chat room

For more information, refer to the [PubNub Presence documentation](https://www.pubnub.com/docs/general/presence/basics). 