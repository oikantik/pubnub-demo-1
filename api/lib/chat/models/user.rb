# frozen_string_literal: true

module Chat
  module Models
    # User model representing a chat participant
    # Stores user identity and relationships to channels and messages
    class User < Sequel::Model
      plugin :timestamps, update_on_create: true

      # User can create many channels
      one_to_many :created_channels, class: 'Chat::Models::Channel', key: :created_by

      # User belongs to many channels
      many_to_many :channels,
                   join_table: :user_channels,
                   left_key: :user_id,
                   right_key: :channel_id,
                   class: 'Chat::Models::Channel'

      # User can send many messages
      one_to_many :messages, key: :sender_id, class: 'Chat::Models::Message'
    end
  end
end
