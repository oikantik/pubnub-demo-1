# frozen_string_literal: true

require 'roar/decorator'
require 'roar/json'
require_relative 'base'
require_relative 'user' # Ensure User representer is loaded
require_relative 'channel' # Ensure Channel representer is loaded

module Chat
  module REST
    module Representers
      # Message representer for API responses
      # Formats message data for JSON serialization
      class Message < Base
        # Message UUID
        property :id
        # Message content (renamed to 'message' in JSON)
        property :text, as: :message

        # Sender object (represented using User representer)
        # Assumes the Message model has a `sender` association
        property :sender, decorator: User, class: Chat::Models::User, getter: :sender

        # Channel UUID (renamed to 'channel' in JSON)
        # Note: We keep channel_id here for simplicity, but could represent the full channel too.
        property :channel_id, as: :channel

        # Message timestamp
        property :timestamp
      end
    end
  end
end
