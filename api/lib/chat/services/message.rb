# frozen_string_literal: true

module Chat
  module Services
    # Message service handling message-related operations
    # including creation, retrieval, and real-time publishing
    class Message
      # Create a new message in a channel and publish it to PubNub
      #
      # @param channel [Chat::Models::Channel] The channel to create the message in
      # @param sender [Chat::Models::User] The user sending the message
      # @param text [String] The text content of the message
      # @return [Chat::Models::Message] The created message
      # @raise [RuntimeError] If the sender is not a member of the channel
      def self.create_in_channel(channel, sender, text)
        # Ensure sender is a member of the channel
        unless Chat::Services::Channel.is_member?(channel, sender)
          raise "User #{sender.id} is not a member of channel #{channel.id}"
        end

        # Create the message
        message = Chat::Models::Message.create(
          text: text,
          sender_id: sender.id,
          channel_id: channel.id,
          timestamp: Time.now.to_i
        )

        # Publish the message to PubNub
        publish_to_pubnub(message, channel.name)

        message
      end

      # Publish a message to PubNub for real-time delivery
      #
      # @param message [Chat::Models::Message] The message to publish
      # @param channel_name [String, nil] Optional channel name override
      # @return [void]
      def self.publish_to_pubnub(message, channel_name = nil)
        begin
          # Get the channel information if needed
          channel = message.channel
          channel_name ||= channel.name
          channel_id = channel.id.to_s

          # Format the message for PubNub
          message_data = {
            id: message.id.to_s,
            message: message.text,
            sender: message.sender.name,
            timestamp: message.timestamp || message.created_at.to_i,
            channel: channel_name,
            channel_id: channel_id,
            event: 'new_message'
          }

          # Publish using the PubNub service to both channel ID and name to ensure delivery
          Chat::Services::Pubnub.instance.publish(
            channel: channel_id,
            message: message_data,
            user_id: message.sender_id
          )

          Chat::Services::Pubnub.instance.publish(
            channel: channel_name,
            message: message_data,
            user_id: message.sender_id
          )
        rescue => e
          # Silently catch errors but don't interrupt the flow
        end
      end

      # Get messages for a channel with pagination
      #
      # @param channel [Chat::Models::Channel] The channel to get messages for
      # @param options [Hash] Optional parameters for pagination
      # @option options [Integer] :limit (50) Maximum number of messages to return
      # @option options [Integer] :offset (0) Offset for pagination
      # @return [Array<Chat::Models::Message>] The messages for the channel
      def self.get_for_channel(channel, options = {})
        limit = options[:limit] || 50
        offset = options[:offset] || 0

        # Build query
        query = Chat::Models::Message.where(channel_id: channel.id)

        # Execute query with pagination
        messages = query.order(Sequel.desc(:timestamp))
                         .limit(limit)
                         .offset(offset)
                         .all
                         .reverse

        messages
      end
    end
  end
end
