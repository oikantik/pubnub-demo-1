# frozen_string_literal: true

require 'active_support/core_ext/hash/indifferent_access'
require 'json'

module Chat
  module Models
    class Message < Sequel::Model
      plugin :timestamps, update_on_create: true

      # Message belongs to a sender
      many_to_one :sender, class: 'Chat::Models::User', key: :sender_id

      # Message belongs to a channel
      many_to_one :channel, class: 'Chat::Models::Channel', key: :channel_id

      def validate
        super
        errors.add(:text, 'cannot be empty') if !text || text.empty?
        errors.add(:sender_id, 'must be present') if !sender_id
        errors.add(:channel_id, 'must be present') if !channel_id
      end

      def self.create_in_channel(text, sender, channel)
        self.create(
          text: text,
          sender_id: sender.id,
          channel_id: channel.id,
          timestamp: Time.now.to_i
        )
      end

      # Convert to hash for API responses
      def to_h
        {
          id: id,
          message: text,
          sender: sender_id,
          timestamp: timestamp,
          channel: channel_id
        }
      end

      def to_json(*_args)
        JSON.generate(to_h)
      end
    end
  end
end
