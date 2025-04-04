# frozen_string_literal: true

module Chat
  module Services
    class Redis
      def self.client
        Chat::REDIS
      end

      def self.set(key, value, ttl = nil)
        if ttl
          client.set(key, value, ex: ttl)
        else
          client.set(key, value)
        end
      end

      def self.get(key)
        client.get(key)
      end

      def self.delete(key)
        client.del(key)
      end

      def self.exists?(key)
        client.exists?(key)
      end

      def self.expire(key, ttl)
        client.expire(key, ttl)
      end

      def self.cache_user_auth_token(user_id, token, ttl = 86400) # Default 24 hours
        set("auth:#{token}", user_id, ttl)
      end

      def self.get_user_from_token(token)
        get("auth:#{token}")
      end

      def self.set_user_token(user_id, token, ttl = 86400)
        # Store token -> user_id mapping for authentication
        set("auth:#{token}", user_id, ttl)
        # Store user_id -> token mapping for pubnub access
        set_pubnub_token(user_id, token, ttl)
      end

      def self.set_pubnub_token(user_id, token, ttl = 86400)
        # Store user_id -> token mapping for PubNub access
        set("pubnub:#{user_id}", token, ttl)
      end

      def self.get_pubnub_token(user_id)
        get("pubnub:#{user_id}")
      end

      def self.store_online_status(user_id, status)
        set("user:#{user_id}:status", status)
      end

      def self.get_online_status(user_id)
        get("user:#{user_id}:status") || 'offline'
      end
    end
  end
end
