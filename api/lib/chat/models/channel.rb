# frozen_string_literal: true

module Chat
  module Models
    class Channel < Sequel::Model
      plugin :timestamps, update_on_create: true

      # Channel belongs to a creator
      many_to_one :creator, class: 'Chat::Models::User', key: :created_by

      # Channel has many messages
      one_to_many :messages, key: :channel_id, class: 'Chat::Models::Message'
    end
  end
end
