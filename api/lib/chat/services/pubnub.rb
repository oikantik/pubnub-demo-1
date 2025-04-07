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
      DEFAULT_TTL_FOR_PUBNUB = 1 # In minutes
      DEFAULT_TTL = 60 * DEFAULT_TTL_FOR_PUBNUB # In seconds

      # Singleton implementation
      include Singleton

      # Initialize the service
      def initialize
        # Initialization code without logging
      end

      # @return [::Pubnub] PubNub admin client with full permissions
      def admin_client
        @admin_client ||= begin
          client = ::Pubnub.new(
            subscribe_key: ENV['PUBNUB_SUBSCRIBE_KEY'],
            publish_key: ENV['PUBNUB_PUBLISH_KEY'],
            secret_key: ENV['PUBNUB_SECRET_KEY'],
            uuid: 'server-admin',
            ssl: true
          )
          client
        end
      rescue => e
        nil
      end

      # Get PubNub client for a specific user's auth token
      #
      # @param user_id [String] The user ID to get client for
      # @return [::Pubnub] PubNub client configured with user's token
      def pubnub_client_for_user(user_id)
        ::Pubnub.new(
          subscribe_key: ENV['PUBNUB_SUBSCRIBE_KEY'],
          publish_key: ENV['PUBNUB_PUBLISH_KEY'],
          uuid: user_id.to_s,
          ssl: true
        )
      rescue => e
        raise e
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

        uuids
      rescue StandardError => e
        nil
      end

      # Grant access to a specific channel for a user
      # In PAMv3, permissions are granted by generating a new token with updated permissions
      #
      # @param user_id [Integer, String] User ID to grant access to
      # @param channel_id [Integer, String] Channel ID to grant access to
      # @return [Boolean] Success or failure of the operation
      def grant_channel_access(user_id, channel_id)
        # Generate a new token with the updated permissions
        # This will include all channels the user has access to
        new_token = generate_token(user_id)
        return false unless new_token

        true
      end

      # Revoke a token
      #
      # @param token [String] The token to revoke
      # @return [Boolean] Success or failure
      def revoke_token(token)
        # Get user ID from token
        user_id = Chat::Services::Redis.get_user_from_token(token)
        return false unless user_id

        # Delete token from Redis
        Chat::Services::Redis.delete("auth:#{token}")
        Chat::Services::Redis.delete("pubnub:#{user_id}")

        true
      end

      # Generate a PubNub access token with permissions for a user
      # Uses PubNub Access Manager v3 (PAMv3) for token generation
      # Tokens are cached in Redis with the appropriate TTL
      #
      # @param user_id [String] User ID to generate token for
      # @param force_refresh [Boolean] If true, generate a new token even if one exists in cache
      # @return [String, nil] Generated token or nil if failure
      def generate_token(user_id, force_refresh = false)
        return cached_token_for_user(user_id) unless force_refresh

        user = Chat::Models::User[user_id]
        return nil unless user

        # Get channel permissions
        channels_with_permissions = channels_for_user(user)

        # Skip token generation if user has no channels
        if channels_with_permissions.empty?
          log_message("User #{user_id} has no channels, skipping token generation")
          return nil
        end

        # Verify necessary configuration is present
        return nil unless validate_pubnub_config
        return nil unless admin_client

        # Generate token from PubNub API
        token_request = request_token(user_id, channels_with_permissions)
        process_token_result(user_id, token_request)
      rescue => e
        log_error("Exception in PubNub token generation", e)
        raise e
      end

      private

      # Get cached token for user if available
      #
      # @param user_id [String] User ID to get token for
      # @return [String, nil] Cached token or nil
      def cached_token_for_user(user_id)
        cached_token = Chat::Services::Redis.get_pubnub_token(user_id)
        return cached_token if cached_token
        nil
      end

      # Validate that PubNub configuration is available
      #
      # @return [Boolean] Whether config is valid
      def validate_pubnub_config
        ENV['PUBNUB_SUBSCRIBE_KEY'] && ENV['PUBNUB_PUBLISH_KEY'] && ENV['PUBNUB_SECRET_KEY']
      end

      # Request token from PubNub API
      #
      # @param user_id [String] User ID to request token for
      # @param channels [Hash] Channel permissions
      # @return [Pubnub::Envelope] PubNub response
      def request_token(user_id, channels)
        admin_client.grant_token(
          ttl: DEFAULT_TTL_FOR_PUBNUB,
          authorized_uuid: user_id.to_s,
          channels: channels,
          http_sync: true
        )
      end

      # Process token result from PubNub API
      #
      # @param user_id [String] User ID the token is for
      # @param token_request [Pubnub::Envelope] PubNub response
      # @return [String, nil] Token or nil on failure
      def process_token_result(user_id, token_request)
        result = token_request&.result

        if result && result[:data] && result[:data]["token"]
          # Store token in Redis with TTL
          token = result[:data]["token"]
          Chat::Services::Redis.set_pubnub_token(user_id, token, DEFAULT_TTL)
          # Also store the user-token mapping for reverse lookup
          Chat::Services::Redis.set_user_token(user_id, token, DEFAULT_TTL)
          token
        elsif token_request&.error?
          handle_token_error(token_request)
          nil
        else
          log_message("No token found in PubNub response")
          nil
        end
      end

      # Handle token error from PubNub API
      #
      # @param token_request [Pubnub::Envelope] PubNub response with error
      # @return [nil]
      def handle_token_error(token_request)
        error_data = token_request&.status&.dig(:data)
        error_message = error_data&.dig(:message) || "Unknown PubNub error"
        error_details = error_data&.dig(:details)

        log_message("PubNub token generation failed: #{error_message}")
        log_message("Error details: #{error_details.inspect}") if error_details

        nil
      end

      # Build channel permissions for PAMv3 token
      #
      # @param user [Chat::Models::User] User to generate permissions for
      # @return [Hash] Channels hash with permissions for PAMv3 token
      def channels_for_user(user)
        # Get channels the user is a member of
        user_channels = Chat::Services::Channel.get_user_channels(user)

        # Create array of channel IDs
        channels = user_channels.map { |c| c.id.to_s }

        channel_permissions = {}

        # Add specific channel permissions
        channels.each do |channel|
          # Main channel - all permissions
          channel_permissions[channel] = ::Pubnub::Permissions.res(
            read: true,
            write: true,
            delete: true,
            get: true,
            update: true,
            manage: true,
            join: true
          )

          # Presence channel - read only
          channel_permissions["#{channel}-pnpres"] = ::Pubnub::Permissions.res(
            read: true
          )
        end

        channel_permissions
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
          false
        else
          true
        end
      end

      # Log a message to the console
      #
      # @param message [String] Message to log
      # @return [nil]
      def log_message(message)
        puts message
        nil
      end

      # Log an error with backtrace
      #
      # @param message [String] Error message
      # @param exception [Exception] Exception object
      # @return [nil]
      def log_error(message, exception)
        puts "#{message}: #{exception.message}"
        puts exception.backtrace.join("\n") if exception.backtrace
        nil
      end
    end
  end
end
