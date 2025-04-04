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

      def self.store_online_status(user_id, status)
        set("user:#{user_id}:status", status)
      end

      def self.get_online_status(user_id)
        get("user:#{user_id}:status") || 'offline'
      end
    end
  end
end
