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

      # Get cached token for user or generate a new one
      #
      # @param user_id [String] User ID to get token for
      # @param force_refresh [Boolean] Whether to force refresh the token
      # @return [String, nil] Valid token or nil
      def token_for_user(user_id, force_refresh = false)
        return cached_token_for_user(user_id) unless force_refresh
        generate_token(user_id)
      end

      # Publish a message to a channel
      #
      # @param channel [String] Channel to publish to
      # @param message [Hash] Message to publish
      # @param user_id [String, nil] User ID to associate with the publish (for auth token)
      # @return [Boolean] Success or failure
      def publish(channel:, message:, user_id: nil)
        client = client_for_publish(user_id)
        return false unless client

        result = publish_to_channel(client, channel, message)
        handle_result(result)
      end

      # Publish a message to its channel
      #
      # @param message [Chat::Models::Message] Message object to publish
      # @return [Boolean] Success or failure
      def publish_message(message)
        message_data = prepare_message_data(message)
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
        user_id = Chat::Services::Redis.get_user_from_token(auth_token)
        return nil unless user_id

        client = pubnub_client_for_user(user_id)
        return nil unless client

        fetch_presence_for_channel(client, channel)
      end

      # Grant access to a specific channel for a user
      # In PAMv3, permissions are granted by generating a new token with updated permissions
      #
      # @param user_id [Integer, String] User ID to grant access to
      # @param channel_id [Integer, String] Channel ID to grant access to
      # @return [Boolean] Success or failure of the operation
      def grant_channel_access(user_id, channel_id)
        token = generate_token(user_id, true)
        !token.nil?
      end

      # Revoke a token
      #
      # @param token [String] The token to revoke
      # @return [Boolean] Success or failure
      def revoke_token(token)
        user_id = Chat::Services::Redis.get_user_from_token(token)
        return false unless user_id

        Chat::Services::Redis.delete("auth:#{token}")
        Chat::Services::Redis.delete("pubnub:#{user_id}")
        true
      end

      # Generate a PubNub access token with permissions for a user
      # Uses PubNub Access Manager v3 (PAMv3) for token generation
      # Tokens are cached in Redis with the appropriate TTL
      #
      # @param user_id [String] User ID to generate token for
      # @param force_refresh [Boolean] Whether to force a new token regardless of cache
      # @return [String, nil] Generated token or nil if failure
      def generate_token(user_id, force_refresh = false)
        # Check cache first if not forcing refresh
        unless force_refresh
          cached = cached_token_for_user(user_id)
          return cached if cached
        end

        user = find_user(user_id)
        return nil unless user

        channels_with_permissions = channels_for_user(user)
        return nil if channels_with_permissions.empty?

        return nil unless admin_client

        token_request = request_token(user_id, channels_with_permissions)
        process_token_result(user_id, token_request)
      rescue
        nil
      end

      private

      # @return [::Pubnub] PubNub admin client with full permissions
      def admin_client
        @admin_client ||= begin
          return nil unless validate_pubnub_config

          ::Pubnub.new(
            subscribe_key: ENV['PUBNUB_SUBSCRIBE_KEY'],
            publish_key: ENV['PUBNUB_PUBLISH_KEY'],
            secret_key: ENV['PUBNUB_SECRET_KEY'],
            uuid: 'server-admin',
            ssl: true
          )
        rescue
          nil
        end
      end

      # Get PubNub client for a specific user's auth token
      #
      # @param user_id [String] The user ID to get client for
      # @return [::Pubnub, nil] PubNub client configured with user's token
      def pubnub_client_for_user(user_id)
        return nil unless validate_pubnub_config

        ::Pubnub.new(
          subscribe_key: ENV['PUBNUB_SUBSCRIBE_KEY'],
          publish_key: ENV['PUBNUB_PUBLISH_KEY'],
          uuid: user_id.to_s,
          ssl: true
        )
      rescue
        nil
      end

      # Get appropriate client for publishing
      #
      # @param user_id [String, nil] User ID to get client for, or nil for admin
      # @return [::Pubnub, nil] Client to use for publishing
      def client_for_publish(user_id)
        user_id ? pubnub_client_for_user(user_id) : admin_client
      end

      # Format message data for publishing
      #
      # @param message [Chat::Models::Message] Message to format
      # @return [Hash] Formatted message data
      def prepare_message_data(message)
        representer = Chat::REST::Representers::Message.new(message)
        message_data = representer.to_hash
        message_data[:event] = 'new_message'
        message_data
      end

      # Publish message to a channel with the given client
      #
      # @param client [::Pubnub] Client to use for publishing
      # @param channel [String] Channel to publish to
      # @param message [Hash] Message to publish
      # @return [Pubnub::Envelope] Result from publish operation
      def publish_to_channel(client, channel, message)
        client.publish(
          channel: channel,
          message: message,
          store: false,
          http_sync: true
        )
      rescue
        nil
      end

      # Fetch presence information for a channel
      #
      # @param client [::Pubnub] Client to use for fetching presence
      # @param channel [String] Channel to fetch presence for
      # @return [Array, nil] UUIDs present in the channel or nil
      def fetch_presence_for_channel(client, channel)
        channel_presence = client.here_now(channel: channel).value
        channel_presence&.result&.dig(:data, :uuids)
      rescue
        nil
      end

      # Get cached token for user if available
      #
      # @param user_id [String] User ID to get token for
      # @return [String, nil] Cached token or nil
      def cached_token_for_user(user_id)
        Chat::Services::Redis.get_pubnub_token(user_id)
      end

      # Find a user by ID
      #
      # @param user_id [String] User ID to find
      # @return [Chat::Models::User, nil] User object or nil
      def find_user(user_id)
        user = Chat::Models::User[user_id]
        log_message("User #{user_id} not found") unless user
        user
      end

      # Validate that PubNub configuration is available
      #
      # @return [Boolean] Whether config is valid
      def validate_pubnub_config
        return true if ENV['PUBNUB_SUBSCRIBE_KEY'] && ENV['PUBNUB_PUBLISH_KEY'] && ENV['PUBNUB_SECRET_KEY']
        log_message("Missing PubNub configuration keys")
        false
      end

      # Request token from PubNub API
      #
      # @param user_id [String] User ID to request token for
      # @param channels [Hash] Channel permissions
      # @return [Pubnub::Envelope, nil] PubNub response or nil
      def request_token(user_id, channels)
        admin_client.grant_token(
          ttl: DEFAULT_TTL_FOR_PUBNUB,
          authorized_uuid: user_id.to_s,
          channels: channels,
          http_sync: true
        )
      rescue
        nil
      end

      # Process token result from PubNub API
      #
      # @param user_id [String] User ID the token is for
      # @param token_request [Pubnub::Envelope] PubNub response
      # @return [String, nil] Token or nil on failure
      def process_token_result(user_id, token_request)
        return nil unless token_request

        # Extract token from different possible locations in the response
        token = extract_token_from_response(token_request)

        if token
          store_token(user_id, token)
        elsif token_request.error?
          handle_token_error(token_request)
          nil
        else
          log_message("No token found in PubNub response")
          nil
        end
      end

      # Extract token from PubNub response object
      #
      # @param token_request [Pubnub::Envelope] PubNub response
      # @return [String, nil] Token or nil if not found
      def extract_token_from_response(token_request)
        # Try different paths where token might be located
        result = token_request.result
        return nil unless result

        # Path 1: In result[:data]["token"]
        return result[:data]["token"] if result[:data] && result[:data]["token"]

        # Path 2: In result[:token]
        return result[:token] if result[:token]

        # Path 3: Parse from body if JSON
        begin
          response_body = token_request.status[:server_response]&.http_body&.body
          if response_body
            parsed = JSON.parse(response_body)
            return parsed["data"]["token"] if parsed["data"] && parsed["data"]["token"]
          end
        rescue
          # Ignore JSON parsing errors
        end

        nil
      end

      # Store token in Redis with appropriate TTL
      #
      # @param user_id [String] User ID to store token for
      # @param token [String] Token to store
      # @return [String] The token
      def store_token(user_id, token)
        Chat::Services::Redis.set_pubnub_token(user_id, token, DEFAULT_TTL)
        Chat::Services::Redis.set_user_token(user_id, token, DEFAULT_TTL)
        token
      end

      # Handle token error from PubNub API
      #
      # @param token_request [Pubnub::Envelope] PubNub response with error
      # @return [nil]
      def handle_token_error(token_request)
        error_message = extract_error_message(token_request)
        log_message("PubNub token generation failed: #{error_message}")
        nil
      end

      # Extract error message from PubNub response
      #
      # @param token_request [Pubnub::Envelope] PubNub response
      # @return [String] Error message
      def extract_error_message(token_request)
        status = token_request&.status
        return "Unknown error" unless status

        # Try to get error from data hash
        if status[:data] && status[:data][:message]
          return status[:data][:message]
        end

        # Try to parse from response body
        begin
          response_body = status[:server_response]&.http_body&.body
          if response_body
            parsed = JSON.parse(response_body)
            return parsed["error"]["message"] if parsed["error"] && parsed["error"]["message"]
          end
        rescue
          # Ignore JSON parsing errors
        end

        # Fallback to HTTP status
        status[:code] ? "HTTP error #{status[:code]}" : "Unknown error"
      end

      # Build channel permissions for PAMv3 token
      #
      # @param user [Chat::Models::User] User to generate permissions for
      # @return [Hash] Channels hash with permissions for PAMv3 token
      def channels_for_user(user)
        user_channels = Chat::Services::Channel.get_user_channels(user)

        if user_channels.empty?
          log_message("User #{user.id} is not a member of any channels")
          return {}
        end

        build_channel_permissions(user_channels)
      end

      # Build channel permissions from channel list
      #
      # @param user_channels [Array<Chat::Models::Channel>] Channels to build permissions for
      # @return [Hash] Channel permissions hash
      def build_channel_permissions(user_channels)
        channel_permissions = {}

        user_channels.each do |channel|
          channel_id = channel.id.to_s

          # Main channel - all permissions
          channel_permissions[channel_id] = ::Pubnub::Permissions.res(
            read: true,
            write: true,
            delete: true,
            get: true,
            update: true,
            manage: true,
            join: true
          )

          # Presence channel - read only
          channel_permissions["#{channel_id}-pnpres"] = ::Pubnub::Permissions.res(
            read: true
          )
        end

        channel_permissions
      end

      # Process PubNub result
      #
      # @param result [Object] Result from PubNub operation
      # @return [Boolean] Success or failure
      def handle_result(result)
        return false unless result

        if result.is_a?(Array)
          !result.any? { |r| r.respond_to?(:error?) && r.error? }
        else
          !result.respond_to?(:error?) || !result.error?
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
    end
  end
end
