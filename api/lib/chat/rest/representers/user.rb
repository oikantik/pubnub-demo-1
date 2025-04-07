# frozen_string_literal: true

require 'roar/decorator'
require 'roar/json'
require_relative 'base'

module Chat
  module REST
    module Representers
      # User representer for API responses
      # Formats user data for JSON serialization
      class User < Base
        # User UUID
        property :id
        # User's display name
        property :name
        # Creation timestamp
        property :created_at
        # Last update timestamp
        property :updated_at
        # User's current status (online/offline)
        property :status, exec_context: :decorator

        # Get the user's online status from Redis
        #
        # @return [String] 'online', 'offline', or other status value
        def status
          Chat::Services::Redis.get_online_status(represented.id) || 'offline'
        end
      end
    end
  end
end
