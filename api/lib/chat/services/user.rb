# frozen_string_literal: true

require 'securerandom'

module Chat
  module Services
    class User
      def self.find_or_create_by_name(name)
        user = Chat::Models::User.where(name: name).first
        return user if user

        Chat::Models::User.create(name: name)
      end

      def self.login(name)
        user = find_or_create_by_name(name)

        # Generate a session token and store in Redis
        token = SecureRandom.uuid
        # Use set_user_token to ensure proper mappings for authentication
        Chat::Services::Redis.set_user_token(user.id, token)

        # Set online status
        Chat::Services::Redis.store_online_status(user.id, 'online')

        [user, token]
      end

      def self.logout(user)
        # Clear token from Redis
        Chat::Services::Redis.store_online_status(user.id, 'offline')
        true
      end

      def self.get_user_channels(user)
        user.channels
      end
    end
  end
end
