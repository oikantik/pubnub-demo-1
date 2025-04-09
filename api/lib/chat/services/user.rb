# frozen_string_literal: true

require 'securerandom'

module Chat
  module Services
    # User service handling user-related operations
    # including creation, authentication, and status management
    class User
      # Find an existing user by name or create a new one
      #
      # @param name [String] The name of the user to find or create
      # @return [Chat::Models::User] The found or created user
      def self.find_or_create_by_name(name)
        user = Chat::Models::User.where(name: name).first
        return user if user

        Chat::Models::User.create(name: name)
      end

      # Login a user - finds or creates the user and generates authentication token
      #
      # @param name [String] The name of the user to login
      # @return [Array<Chat::Models::User, String>] The user and authentication token
      def self.login(name)
        user = find_or_create_by_name(name)

        # Generate a session token and store in Redis
        token = SecureRandom.hex(32)

        # Cache auth token for lookup (token -> user_id)
        Chat::Services::Redis.cache_auth_token_lookup(user.id.to_s, token)

        # Set online status
        Chat::Services::Redis.store_online_status(user.id, 'online')

        [user, token]
      end

      # Logout a user - update their status to offline
      #
      # @param user [Chat::Models::User] The user to logout
      # @return [Boolean] True if logout successful
      def self.logout(user)
        # Clear token from Redis
        Chat::Services::Redis.store_online_status(user.id, 'offline')
        true
      end

      # Get all channels a user is a member of
      #
      # @param user [Chat::Models::User] The user to get channels for
      # @return [Array<Chat::Models::Channel>] The channels the user is a member of
      def self.get_user_channels(user)
        user.channels
      end
    end
  end
end
