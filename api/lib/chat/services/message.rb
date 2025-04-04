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

        # Publish the message
        Chat::Services::Pubnub.publish_message(message)

        message
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
