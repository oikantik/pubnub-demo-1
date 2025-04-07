# frozen_string_literal: true

require 'roar/decorator'
require 'roar/json'
require_relative 'base'

module Chat
  module REST
    module Representers
      # Channel representer for API responses
      # Formats channel data for JSON serialization
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
        # Will only be included if include_members option is true
        collection :members, exec_context: :decorator, if: ->(_) { self.include_members? }

        # Check if members should be included in the response
        #
        # @return [Boolean] True if members should be included
        def include_members?
          options[:include_members] || false
        end

        # Get the list of members for this channel
        #
        # @return [Array<Hash>] List of serialized users who are members
        def members
          return [] unless include_members?

          represented.users.map do |user|
            Chat::REST::Representers::User.new(user).to_hash
          end
        end
      end
    end
  end
end
