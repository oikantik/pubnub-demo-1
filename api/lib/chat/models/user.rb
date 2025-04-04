# frozen_string_literal: true

module Chat
  module Models
    class User < Sequel::Model
      plugin :timestamps, update_on_create: true

      # User can create many channels
      one_to_many :created_channels, class: 'Chat::Models::Channel', key: :created_by

      # User can send many messages
      one_to_many :messages, key: :sender_id, class: 'Chat::Models::Message'

      def validate
        super
        errors.add(:name, 'cannot be empty') if !name || name.empty?
      end

      def self.find_or_create_by_name(name)
        user = self.where(name: name).first
        return user if user

        self.create(name: name)
      end

      # Convert to hash for API responses
      def to_h
        {
          id: id,
          name: name,
          created_at: created_at,
          updated_at: updated_at
        }
      end
    end
  end
end
