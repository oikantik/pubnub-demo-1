# PubNub Messaging

PubNub's core functionality revolves around real-time messaging through the publish/subscribe paradigm. This guide covers the essential messaging concepts and APIs for building a chat application.

## Core Concepts

### Channels

Channels are the fundamental communication pathway in PubNub. They act as topics or rooms where messages are published and subscribed to:

- **Public Channels**: Open to anyone with the proper keys
- **Private Channels**: Access controlled using PubNub Access Manager
- **Direct Messaging**: Typically implemented using unique channels between users

### Publishing Messages

Publishing sends a message to all subscribers of a channel:

```ruby
pubnub.publish(
  channel: 'my-channel',
  message: {
    text: 'Hello world!',
    sender: 'user-123',
    timestamp: Time.now.to_i
  }
)
```

### Subscribing to Channels

Subscribing lets you receive messages in real-time as they're published:

```ruby
pubnub.subscribe(
  channels: ['channel-1', 'channel-2']
)

# Add a listener to process incoming messages
pubnub.add_listener(
  callback: lambda do |envelope|
    if envelope.is_a?(Pubnub::Envelope::Message)
      # Handle message
      message = envelope.result[:data]
      puts "Received message: #{message}"
      puts "Channel: #{envelope.result[:channel]}"
    end
  end
)
```

### Unsubscribing

When you no longer need to receive messages from a channel:

```ruby
pubnub.unsubscribe(
  channels: ['my-channel']
)
```

## Message Types

### Standard Messages

Standard PubNub messages can contain any JSON-serializable data up to 32KB in size:

```ruby
pubnub.publish(
  channel: 'chat',
  message: {
    type: 'text',
    content: 'Hello everyone!',
    sender: {
      id: 'user-123',
      name: 'John Doe'
    },
    attachments: [],
    timestamp: Time.now.to_i
  }
)
```

### Signals

Signals are lightweight messages (up to 64 bytes) ideal for typing indicators, read receipts, or other ephemeral notifications:

```ruby
pubnub.signal(
  channel: 'chat',
  message: {
    type: 'typing',
    userId: 'user-123'
  }
)
```

## Message History

PubNub can store published messages for later retrieval.

### Fetching Message History

```ruby
result = pubnub.history(
  channel: 'my-channel',
  count: 100,  # Number of messages to retrieve
  reverse: true  # Newest messages first
)

# Access messages
messages = result.result[:data][:messages]
```

### Fetching Messages with Timetoken Range

```ruby
result = pubnub.history(
  channel: 'my-channel',
  start: 15754897138199685,  # Start timetoken
  end: 15754898138199685,    # End timetoken
  count: 50
)
```

## Message Persistence and Storage

By default, messages published on PubNub are not stored. To enable message storage and retrieval:

1. Enable Storage & Playback in your PubNub Admin Portal for your keyset
2. Publish messages with the `store` flag set to true:

```ruby
pubnub.publish(
  channel: 'my-channel',
  message: { text: 'This message will be stored' },
  store: true
)
```

## Message Filtering

PubNub allows filtering messages at the server level through the Message Filter Expression:

```ruby
# Initialize PubNub with a filter expression
pubnub = Pubnub.new(
  subscribe_key: 'my_subscribe_key',
  publish_key: 'my_publish_key',
  uuid: 'my_uuid',
  filter_expression: "sender == 'user-123' || type == 'urgent'"
)
```

## Putting It All Together: Chat Application Example

Here's how to implement a basic chat functionality:

```ruby
# Server-side code
# Initialize PubNub with server credentials
server_pubnub = Pubnub.new(
  subscribe_key: ENV['PUBNUB_SUBSCRIBE_KEY'],
  publish_key: ENV['PUBNUB_PUBLISH_KEY'],
  secret_key: ENV['PUBNUB_SECRET_KEY'],
  uuid: 'server-admin'
)

# Generate token for a user
def generate_user_token(user_id, channels)
  token_request = server_pubnub.grant_token(
    ttl: 1440,  # 24 hours
    authorized_uuid: user_id,
    resources: {
      channels: channels.reduce({}) do |acc, channel|
        acc[channel] = { read: true, write: true }
        acc
      end
    }
  )
  
  token_request.result[:token]
end

# Client-side code
# Initialize PubNub with client credentials and token
client_pubnub = Pubnub.new(
  subscribe_key: 'my_subscribe_key',
  publish_key: 'my_publish_key',
  auth_key: token,  # Token received from server
  uuid: 'user-123'
)

# Subscribe to a chat channel
client_pubnub.subscribe(
  channels: ['chat-room-1'],
  with_presence: true
)

# Listen for messages
client_pubnub.add_listener(
  callback: lambda do |envelope|
    case envelope
    when Pubnub::Envelope::Message
      # Handle chat message
      puts "Received: #{envelope.result[:data]}"
    when Pubnub::Envelope::Presence
      # Handle presence event
      puts "Presence event: #{envelope.result[:data]}"
    when Pubnub::Envelope::Signal
      # Handle signal (like typing indicator)
      puts "Signal: #{envelope.result[:data]}"
    end
  end
)

# Send a message
client_pubnub.publish(
  channel: 'chat-room-1',
  message: {
    type: 'text',
    content: 'Hello everyone!',
    sender: {
      id: 'user-123',
      name: 'John Doe'
    },
    timestamp: Time.now.to_i
  }
)

# Send a typing indicator
client_pubnub.signal(
  channel: 'chat-room-1',
  message: {
    type: 'typing',
    user: 'user-123',
    isTyping: true
  }
)
```

## Best Practices for Chat Applications

1. **Structure messages consistently**: Define a clear schema for your chat messages
2. **Use presence for online status**: Display who's online in the chat
3. **Implement typing indicators with signals**: Use lightweight signals for ephemeral states
4. **Secure channels with Access Manager**: Control who can read and write to each channel
5. **Paginate message history**: Load messages in chunks for better performance
6. **Handle reconnections**: Implement reconnection logic to handle network disruptions
7. **Store important messages**: Enable storage for channels where history is important

For more detailed information, refer to the [PubNub Messaging documentation](https://www.pubnub.com/docs/general/messages/publish). 