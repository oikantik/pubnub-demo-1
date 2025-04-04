# frozen_string_literal: true

require 'roar/decorator'
require 'roar/json'
require_relative 'base'

module Chat
  module REST
    module Representers
      class Message < Base
        property :id
        property :text, as: :message
        property :sender_id, as: :sender
        property :channel_id, as: :channel
        property :timestamp

        # Include sender and channel info if requested
        property :sender_info, exec_context: :decorator, if: ->(_) { self.include_sender? }
        property :channel_info, exec_context: :decorator, if: ->(_) { self.include_channel? }

        def include_sender?
          options[:include_sender] || false
        end

        def include_channel?
          options[:include_channel] || false
        end

        def sender_info
          return nil unless include_sender?
          user = Chat::Models::User[represented.sender_id]
          return nil unless user

          Chat::REST::Representers::User.new(user).to_hash
        end

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
