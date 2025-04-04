# frozen_string_literal: true

require 'active_support/core_ext/hash/indifferent_access'
require 'json'

module Chat
  module Models
    class Message
      attr_accessor :id, :text, :sender, :timestamp, :channel

      def initialize(attributes = {})
        attributes = attributes.with_indifferent_access if attributes.respond_to?(:with_indifferent_access)
        @id = attributes[:id] || SecureRandom.uuid
        @text = attributes[:message] || attributes[:text]
        @sender = attributes[:sender]
        @timestamp = attributes[:timestamp] || Time.now.to_i
        @channel = attributes[:channel]
      end

      def to_h
        {
          id: id,
          message: text,
          sender: sender,
          timestamp: timestamp,
          channel: channel
        }
      end

      def to_json(*_args)
        JSON.generate(to_h)
      end
    end
  end
end
