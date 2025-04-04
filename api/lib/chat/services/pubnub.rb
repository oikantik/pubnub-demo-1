# frozen_string_literal: true

require 'pubnub'

module Chat
  module Services
    class Pubnub
      attr_reader :pubnub

      def initialize
        @pubnub = ::Pubnub.new(
          subscribe_key: ENV['PUBNUB_SUBSCRIBE_KEY'],
          publish_key: ENV['PUBNUB_PUBLISH_KEY'],
          secret_key: ENV['PUBNUB_SECRET_KEY'],
          uuid: 'server-admin'
        )
      end

      def publish(channel, message)
        @pubnub.publish(
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

      def subscribe(channels, callback)
        @pubnub.subscribe(
          channels: Array(channels)
        ) do |envelope|
          callback.call(envelope)
        end
      end

      def generate_token(user_id, ttl = 86400)
        channels = ['*']
        token = @pubnub.grant(
          ttl: ttl,
          channels: channels,
          channel_groups: ['*'],
          authorized_uuid: user_id.to_s,
          read: true,
          write: true,
          manage: false
        )
        token.result[:token]
      end
    end
  end
end
