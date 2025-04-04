# frozen_string_literal: true

module Chat
  module Services
    module Operations
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
          Chat::Services::Redis.cache_user_auth_token(user.id, token)

          # Set online status
          Chat::Services::Redis.store_online_status(user.id, 'online')

          [user, token]
        end
      end
    end
  end
end
