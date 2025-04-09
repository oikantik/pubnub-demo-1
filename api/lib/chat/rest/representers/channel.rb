# frozen_string_literal: true

require 'roar/decorator'
require 'roar/json'
require_relative 'base'
require_relative 'user' # Ensure User representer is loaded

module Chat
  module REST
    module Representers
      # Channel representer for API responses
      # Formats channel data including its members for JSON serialization
      class Channel < Base
        # Channel UUID
        property :id
        # Channel name
        property :name
        # Channel description
        property :description
        # UUID of the user who created the channel
        property :created_by
        # Creation timestamp
        property :created_at
        # Last update timestamp
        property :updated_at

        # Channel members (users)
        # Uses the User representer to format each member, including their status.
        # Fetches the collection via the :users association on the Channel model.
        collection :members, decorator: User, class: Chat::Models::User, getter: :users
      end
    end
  end
end
