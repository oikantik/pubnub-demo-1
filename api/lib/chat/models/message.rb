# frozen_string_literal: true

module Chat
  module Models
    # Message model representing a chat message
    # Stores message content and relationships to sender and channel
    class Message < Sequel::Model
      plugin :timestamps, update_on_create: true

      # Message belongs to a sender
      many_to_one :sender, class: 'Chat::Models::User', key: :sender_id

      # Message belongs to a channel
      many_to_one :channel, class: 'Chat::Models::Channel', key: :channel_id
    end
  end
end
