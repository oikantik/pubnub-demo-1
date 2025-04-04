# frozen_string_literal: true

require 'pubnub'

module Chat
  module Services
    class Pubnub
      CHANNEL_UPDATES = 'channel-updates'
      DEFAULT_TTL = 86400 # 24 hours

      def self.client
        @client ||= ::Pubnub.new(
          subscribe_key: ENV['PUBNUB_SUBSCRIBE_KEY'],
          publish_key: ENV['PUBNUB_PUBLISH_KEY'],
          secret_key: ENV['PUBNUB_SECRET_KEY'],
          uuid: 'server-admin'
        )
      end

      def self.publish(channel, message)
        client.publish(
          channel: channel,
          message: message
        ) do |envelope|
          if envelope.error
            puts "Error publishing to PubNub: #{envelope.error}"
          else
            puts "Successfully published to PubNub: #{envelope.status}"
          end
        end
      end

      def self.publish_message(message)
        representer = Chat::REST::Representers::Message.new(message)
        publish(message.channel_id.to_s, representer.to_hash)
      end

      def self.notify_channel_members(channel, creator)
        # This notifies all users about a new channel being created
        # It's not creating a PubNub channel (which doesn't need explicit creation)
        # but rather informing clients that a new channel exists in our application
        representer = Chat::REST::Representers::Channel.new(channel)
        publish(CHANNEL_UPDATES, {
          event: 'channel_created',
          channel: representer.to_hash,
          creator: Chat::REST::Representers::User.new(creator).to_hash
        })
      end

      def self.notify_channel_join(channel, user)
        representer = Chat::REST::Representers::User.new(user)
        publish(channel.id.to_s, {
          event: 'user_joined',
          user: representer.to_hash
        })
      end

      def self.subscribe(channels, callback)
        client.subscribe(
          channels: Array(channels)
        ) do |envelope|
          callback.call(envelope)
        end
      end

      def self.generate_token(user_id)
        # Get user object
        user = Chat::Models::User[user_id]
        return nil unless user

        # Get channels the user is a member of
        user_channels = Chat::Services::Channel.get_user_channels(user)

        # Create array of channel IDs and add the channel-updates channel
        channels = user_channels.map { |c| c.id.to_s }
        channels << CHANNEL_UPDATES

        # Generate token with access only to these channels
        token = client.grant(
          ttl: DEFAULT_TTL,
          channels: channels,
          authorized_uuid: user_id.to_s,
          read: true,
          write: true,
          manage: false
        )

        # Store token in Redis with same TTL
        token_value = token.result[:token]
        Chat::Services::Redis.set("pubnub:#{user_id}", token_value, DEFAULT_TTL)

        token_value
      end
    end
  end
end
