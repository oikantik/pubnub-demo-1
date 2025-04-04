# frozen_string_literal: true

module Chat
  module Services
    class Message
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

      def self.publish_to_pubnub(message, channel_name = nil)
        begin
          # Get the channel information if needed
          channel = message.channel
          channel_name ||= channel.name
          channel_id = channel.id.to_s

          puts "Publishing message to PubNub: #{message.id} to channel: #{channel_name} (#{channel_id})"

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
          puts "Publishing to channel ID: #{channel_id}"
          Chat::Services::Pubnub.instance.publish(
            channel: channel_id,
            message: message_data,
            user_id: message.sender_id
          )

          puts "Publishing to channel name: #{channel_name}"
          Chat::Services::Pubnub.instance.publish(
            channel: channel_name,
            message: message_data,
            user_id: message.sender_id
          )
        rescue => e
          puts "Error publishing message to PubNub: #{e.message}"
          puts e.backtrace.join("\n")
        end
      end

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
