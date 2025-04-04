# frozen_string_literal: true

module Chat
  module Services
    module Operations
      class Message
        def self.create_in_channel(text, sender, channel)
          # Ensure sender is a member of the channel
          unless Chat::Services::Operations::Channel.is_member?(channel, sender)
            raise "User #{sender.id} is not a member of channel #{channel.id}"
          end

          # Create the message
          message = Chat::Models::Message.create(
            text: text,
            sender_id: sender.id,
            channel_id: channel.id,
            timestamp: Time.now.to_i
          )

          # Publish to PubNub
          pubnub_service = Chat::Services::Pubnub.new
          pubnub_service.publish(
            channel.id.to_s,
            Chat::REST::Representers::Message.new(message).to_hash
          )

          message
        end

        def self.get_channel_messages(channel, before = nil, limit = 50)
          # Build query
          query = Chat::Models::Message.where(channel_id: channel.id)

          # Add timestamp filter if provided
          query = query.where(Sequel.lit('timestamp < ?', before)) if before

          # Execute query
          messages = query.order(Sequel.desc(:timestamp))
                         .limit(limit)
                         .all
                         .reverse

          messages
        end
      end
    end
  end
end
