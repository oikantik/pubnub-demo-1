# frozen_string_literal: true

require 'pubnub'
require 'securerandom'
require 'singleton'

module Chat
  module Services
    # PubNub service for real-time messaging
    # Handles token generation and publishing messages
    # Uses PubNub Access Manager v3 (PAMv3) for authorization
    class Pubnub
      # Channel for global updates like new channel creation
      CHANNEL_UPDATES = 'channel-updates'

      # Default token TTL in seconds (24 hours)
      DEFAULT_TTL = 86400

      # Singleton implementation
      include Singleton

      # Initialize the service
      def initialize; end

      # @return [::Pubnub] PubNub admin client with full permissions
      def admin_client
        @admin_client ||= ::Pubnub.new(
          subscribe_key: ENV['PUBNUB_SUBSCRIBE_KEY'],
          publish_key: ENV['PUBNUB_PUBLISH_KEY'],
          secret_key: ENV['PUBNUB_SECRET_KEY'],
          uuid: 'server-admin',
          ssl: true
        )
      end

      # Get PubNub client for a specific user's auth token
      #
      # @param user_id [String] The user ID to get client for
      # @return [::Pubnub] PubNub client configured with user's token
      def pubnub_client_for_user(user_id)
        # Get token for user
        token = Chat::Services::Redis.get_pubnub_token(user_id)
        return admin_client unless token

        # Create a new client with the token
        ::Pubnub.new(
          subscribe_key: ENV['PUBNUB_SUBSCRIBE_KEY'],
          publish_key: ENV['PUBNUB_PUBLISH_KEY'],
          uuid: user_id.to_s,
          auth: token,
          ssl: true
        )
      end

      # Publish a message to a channel
      #
      # @param channel [String] Channel to publish to
      # @param message [Hash] Message to publish
      # @param user_id [String, nil] User ID to associate with the publish (for auth token)
      # @return [Boolean] Success or failure
      def publish(channel:, message:, user_id: nil)
        # Get client for user or admin client
        pubnub = user_id ? pubnub_client_for_user(user_id) : admin_client

        # Publish message
        result = pubnub.publish(
          channel: channel,
          message: message,
          store: false,
          http_sync: true
        )

        handle_result(result, "Error publishing to PubNub")
      end

      # Publish a message to its channel
      #
      # @param message [Chat::Models::Message] Message object to publish
      # @return [Boolean] Success or failure
      def publish_message(message)
        representer = Chat::REST::Representers::Message.new(message)
        message_data = representer.to_hash
        message_data[:event] = 'new_message'

        publish(
          channel: message.channel_id.to_s,
          message: message_data,
          user_id: message.sender_id
        )
      end

      # Get presence information for a channel
      #
      # @param channel [String] The channel to check presence for
      # @param auth_token [String] Authentication token for the request
      # @return [Array, nil] Array of UUIDs present in the channel or nil on error
      def presence_on_channel(channel, auth_token:)
        # Get user from token
        user_id = Chat::Services::Redis.get_user_from_token(auth_token)
        return nil unless user_id

        # Get client for user
        pubnub = pubnub_client_for_user(user_id)

        # Request presence information
        channel_presence_future = pubnub.here_now(
          channel: channel
        )

        # Extract result (blocking call)
        channel_presence = channel_presence_future.value
        uuids = channel_presence.result[:data][:uuids]

        puts "Presence on channel #{channel}: #{uuids}"

        uuids
      rescue StandardError => e
        puts "Error getting presence on channel #{channel}: #{e.message}"
        nil
      end

      # Generate a PubNub access token with permissions for a user
      # Uses PubNub Access Manager v3 (PAMv3) for token generation
      #
      # @param user_id [String] User ID to generate token for
      # @return [String, nil] Generated token or nil if failure
      def generate_token(user_id)
        # Get user object
        user = Chat::Models::User[user_id]
        return nil unless user

        # Get channel resources with permissions
        resources = token_resources_for_user(user)

        # Create token with permissions using PAMv3
        token_request = admin_client.grant_token(
          ttl: DEFAULT_TTL,
          resources: resources,
          http_sync: true
        )

        # Process result
        result = token_request.result

        if result && result[:token]
          # Store token in Redis with TTL
          Chat::Services::Redis.set_user_token(result[:token], user.id, DEFAULT_TTL)
          result[:token]
        else
          puts "Error generating token: #{token_request.status[:error]}"
          nil
        end
      end

      private

      # Build resource permissions object for PAMv3 token
      #
      # @param user [Chat::Models::User] User to generate permissions for
      # @return [Hash] Resources hash for PAMv3 token
      def token_resources_for_user(user)
        # Get channels the user is a member of
        user_channels = Chat::Services::Channel.get_user_channels(user)

        # Create array of channel IDs and add the channel-updates channel
        channels = user_channels.map { |c| c.id.to_s }
        channels << CHANNEL_UPDATES

        # Initialize resources structure
        resources = {
          channels: {},
          channel_groups: {},
          uuids: {
            # Add permission for the user's own UUID
            user.id.to_s => {
              update: true,
              delete: false
            }
          }
        }

        # Add channel permissions
        channels.each do |channel|
          # Main channel - read and write
          resources[:channels][channel] = {
            read: true,
            write: true
          }

          # Presence channel - read only
          resources[:channels]["#{channel}-pnpres"] = {
            read: true
          }
        end

        resources
      end

      # Process PubNub result, handle errors
      #
      # @param result [Object] Result from PubNub operation
      # @param error_message [String] Error message prefix to use
      # @return [Object] Original result object
      def handle_result(result, error_message)
        if result.is_a?(Array)
          result.each { |r| handle_single_result(r, error_message) }
        else
          handle_single_result(result, error_message)
        end
        result
      end

      # Process a single PubNub result
      #
      # @param result [Object] Result from PubNub operation
      # @param error_message [String] Error message prefix to use
      # @return [Boolean] Success or failure
      def handle_single_result(result, error_message)
        if result&.error?
          response = result.status[:server_response]
          error_detail = response.respond_to?(:body) ? response.body : response.to_s
          puts "#{error_message}: #{error_detail}"
          false
        else
          true
        end
      end
    end
  end
end
