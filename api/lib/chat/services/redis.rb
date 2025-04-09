# frozen_string_literal: true

module Chat
  module Services
    # Redis service providing cache and state management functionality
    # Wraps Redis operations with application-specific methods
    class Redis
      # Get the Redis client instance
      #
      # @return [::Redis] Redis client instance
      def self.client
        Chat::REDIS
      end

      # Set a value in Redis with optional TTL
      #
      # @param key [String] The key to set
      # @param value [String] The value to store
      # @param ttl [Integer, nil] Optional time-to-live in seconds
      # @return [String] "OK" if successful
      def self.set(key, value, ttl = nil)
        if ttl
          client.set(key, value, ex: ttl)
        else
          client.set(key, value)
        end
      end

      # Get a value from Redis
      #
      # @param key [String] The key to retrieve
      # @return [String, nil] The stored value or nil if not found
      def self.get(key)
        client.get(key)
      end

      # Delete a key from Redis
      #
      # @param key [String] The key to delete
      # @return [Integer] Number of keys deleted (0 or 1)
      def self.delete(key)
        client.del(key)
      end

      # Check if a key exists in Redis
      #
      # @param key [String] The key to check
      # @return [Boolean] True if the key exists
      def self.exists?(key)
        client.exists?(key)
      end

      # Set an expiration time on a key
      #
      # @param key [String] The key to set expiration on
      # @param ttl [Integer] Time-to-live in seconds
      # @return [Boolean] True if the timeout was set
      def self.expire(key, ttl)
        client.expire(key, ttl)
      end

      # Cache the mapping from an app auth token to a user ID.
      #
      # @param user_id [String] The user ID
      # @param token [String] The application authentication token
      # @param ttl [Integer] Time-to-live in seconds (default: 24 hours)
      # @return [String] "OK" if successful
      def self.cache_auth_token_lookup(user_id, token, ttl = 86400)
        # Store token -> user_id mapping for authentication
        set("auth:#{token}", user_id, ttl)
      end

      # Get a user ID from an application authentication token
      #
      # @param token [String] The application authentication token
      # @return [String, nil] The user ID or nil if not found
      def self.get_user_from_token(token)
        get("auth:#{token}")
      end

      # Set a user's PubNub PAM token
      #
      # @param user_id [String] The user ID
      # @param token [String] The PubNub PAM token
      # @param ttl [Integer] Time-to-live in seconds
      # @return [String] "OK" if successful
      def self.set_pubnub_token(user_id, token, ttl = Chat::Services::Pubnub::DEFAULT_TTL_SECONDS)
        # Store user_id -> PubNub PAM token mapping
        set("pubnub:#{user_id}", token, ttl)
      end

      # Get a user's PubNub PAM token
      #
      # @param user_id [String] The user ID
      # @return [String, nil] The PubNub PAM token or nil if not found
      def self.get_pubnub_token(user_id)
        get("pubnub:#{user_id}")
      end

      # Store a user's online status
      #
      # @param user_id [String] The user ID
      # @param status [String] The status ('online', 'offline', etc.)
      # @return [String] "OK" if successful
      def self.store_online_status(user_id, status)
        set("user:#{user_id}:status", status)
      end

      # Get a user's online status
      #
      # @param user_id [String] The user ID
      # @return [String] The user's status, 'offline' if not found
      def self.get_online_status(user_id)
        get("user:#{user_id}:status") || 'offline'
      end
    end
  end
end
