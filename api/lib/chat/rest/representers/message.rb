# frozen_string_literal: true

require 'roar/decorator'
require 'roar/json'
require_relative 'base'

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
        # Sender's UUID (renamed to 'sender' in JSON)
        property :sender_id, as: :sender
        # Channel UUID (renamed to 'channel' in JSON)
        property :channel_id, as: :channel
        # Message timestamp
        property :timestamp

        # Detailed sender information
        # Only included if include_sender option is true
        property :sender_info, exec_context: :decorator, if: ->(_) { self.include_sender? }
        # Detailed channel information
        # Only included if include_channel option is true
        property :channel_info, exec_context: :decorator, if: ->(_) { self.include_channel? }

        # Check if sender details should be included
        #
        # @return [Boolean] True if sender details should be included
        def include_sender?
          options[:include_sender] || false
        end

        # Check if channel details should be included
        #
        # @return [Boolean] True if channel details should be included
        def include_channel?
          options[:include_channel] || false
        end

        # Get detailed sender information
        #
        # @return [Hash, nil] Serialized sender data or nil if not included/found
        def sender_info
          return nil unless include_sender?
          user = Chat::Models::User[represented.sender_id]
          return nil unless user

          Chat::REST::Representers::User.new(user).to_hash
        end

        # Get detailed channel information
        #
        # @return [Hash, nil] Serialized channel data or nil if not included/found
        def channel_info
          return nil unless include_channel?
          channel = Chat::Models::Channel[represented.channel_id]
          return nil unless channel

          Chat::REST::Representers::Channel.new(channel).to_hash
        end
      end
    end
  end
end
