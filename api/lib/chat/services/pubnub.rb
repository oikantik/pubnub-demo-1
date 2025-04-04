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

      # Default token TTL in seconds (24 hours)
      DEFAULT_TTL = 86400

      # Singleton implementation
      include Singleton

      # Initialize the service
      def initialize
        # Log environment variables (redact sensitive parts)
        puts "PubNub initialized with keys:"
        puts "  Subscribe Key: #{ENV['PUBNUB_SUBSCRIBE_KEY'] ? ENV['PUBNUB_SUBSCRIBE_KEY'][0..5] + '...' : 'Missing'}"
        puts "  Publish Key: #{ENV['PUBNUB_PUBLISH_KEY'] ? ENV['PUBNUB_PUBLISH_KEY'][0..5] + '...' : 'Missing'}"
        puts "  Secret Key: #{ENV['PUBNUB_SECRET_KEY'] ? 'Configured (Hidden)' : 'Missing'}"
      end

      # @return [::Pubnub] PubNub admin client with full permissions
      def admin_client
        @admin_client ||= begin
          puts "Creating PubNub admin client with keys"
          client = ::Pubnub.new(
            subscribe_key: ENV['PUBNUB_SUBSCRIBE_KEY'],
            publish_key: ENV['PUBNUB_PUBLISH_KEY'],
            secret_key: ENV['PUBNUB_SECRET_KEY'],
            uuid: 'server-admin',
            ssl: true
          )
          puts "PubNub admin client created successfully"
          client
        end
      rescue => e
        puts "Error creating PubNub admin client: #{e.class.name} - #{e.message}"
        puts e.backtrace.join("\n")
        nil
      end

      # Get PubNub client for a specific user's auth token
      #
      # @param user_id [String] The user ID to get client for
      # @return [::Pubnub] PubNub client configured with user's token
      def pubnub_client_for_user(user_id)
        # Get token for user
        token = Chat::Services::Redis.get_pubnub_token(user_id)
        unless token
          puts "No PubNub token found in Redis for user #{user_id}, falling back to admin client"
          return admin_client
        end

        puts "Creating PubNub client for user #{user_id} with token"
        # Create a new client with the token
        ::Pubnub.new(
          subscribe_key: ENV['PUBNUB_SUBSCRIBE_KEY'],
          publish_key: ENV['PUBNUB_PUBLISH_KEY'],
          uuid: user_id.to_s,
          auth: token,
          ssl: true
        )
      rescue => e
        puts "Error creating PubNub client for user: #{e.class.name} - #{e.message}"
        puts e.backtrace.join("\n")
        admin_client
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
        puts "Generating PubNub token for user: #{user_id}, force_refresh: #{force_refresh}"

        # Check if we have a cached token unless forcing refresh
        unless force_refresh
          puts "Checking for cached token in Redis for user #{user_id}"
          cached_token = Chat::Services::Redis.get_pubnub_token(user_id)
          if cached_token
            puts "Found cached token for user #{user_id}"
            return cached_token
          end
          puts "No cached token found for user #{user_id}"
        end

        # Get user object
        user = Chat::Models::User[user_id]
        unless user
          puts "Error: User #{user_id} not found"
          return nil
        end

        # Get channel resources with permissions
        puts "Building resources for user #{user_id}"
        resources = token_resources_for_user(user)
        puts "Resources for token: #{resources.inspect}"

        # Verify PubNub keys are available
        unless ENV['PUBNUB_SUBSCRIBE_KEY'] && ENV['PUBNUB_PUBLISH_KEY'] && ENV['PUBNUB_SECRET_KEY']
          puts "Error: Missing PubNub keys in environment"
          puts "  Subscribe Key: #{ENV['PUBNUB_SUBSCRIBE_KEY'] ? 'Present' : 'Missing'}"
          puts "  Publish Key: #{ENV['PUBNUB_PUBLISH_KEY'] ? 'Present' : 'Missing'}"
          puts "  Secret Key: #{ENV['PUBNUB_SECRET_KEY'] ? 'Present' : 'Missing'}"
          return nil
        end

        # Create token with permissions using PAMv3
        puts "Requesting token from PubNub for user #{user_id}"
        begin
          # First verify admin client is available
          unless admin_client
            puts "Error: PubNub admin client is not available"
            return nil
          end

          token_request = admin_client.grant_token(
            ttl: DEFAULT_TTL,
            resources: resources,
            authorized_uuid: user_id.to_s,
            http_sync: true
          )

          # Process result
          result = token_request&.result
          status = token_request&.status

          # Debug the status and result
          puts "PubNub token request status: #{status.inspect}"

          if result && result[:token]
            puts "Successfully received token from PubNub for user #{user_id}"
            # Store token in Redis with TTL
            Chat::Services::Redis.set_pubnub_token(user_id, result[:token], DEFAULT_TTL)
            # Also store the user-token mapping for reverse lookup
            Chat::Services::Redis.set_user_token(user_id, result[:token], DEFAULT_TTL)
            result[:token]
          else
            error_details = status && status[:error] ? status[:error].inspect : 'Unknown error'
            puts "Error generating token for user #{user_id}: #{error_details}"
            puts "Status: #{status.inspect}"
            nil
          end
        rescue => e
          puts "Exception while generating token for user #{user_id}: #{e.class.name} - #{e.message}"
          puts e.backtrace.join("\n")
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

        # Create array of channel IDs
        channels = user_channels.map { |c| c.id.to_s }
        puts "User #{user.id} has access to channels: #{channels.join(', ')}"

        # Add a global resource to allow access to all channels
        # This is a simplification for the demo, in production you would be more restrictive
        resources = {
          channels: {
            # Allow access to all channels for demo purposes
            '*': {
              read: true,
              write: true,
              get: true,
              update: true,
              join: true
            }
          },
          channel_groups: {},
          uuids: {
            # Add permission for the user's own UUID
            user.id.to_s => {
              update: true,
              get: true
            }
          }
        }

        # Add specific channel permissions (in addition to the wildcard)
        channels.each do |channel|
          # Main channel - all permissions
          resources[:channels][channel] = {
            read: true,
            write: true,
            delete: true,
            get: true,
            update: true,
            manage: true,
            join: true
          }

          # Presence channel - read only
          resources[:channels]["#{channel}-pnpres"] = {
            read: true
          }
        end

        # Add token updates channel for receiving token refresh notifications
        resources[:channels]["token-updates"] = {
          read: true
        }

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
