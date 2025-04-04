# frozen_string_literal: true

module Chat
  module Services
    module Operations
      class Channel
        def self.create_with_creator(attrs, creator)
          channel = nil
          Chat::DB.transaction do
            channel = Chat::Models::Channel.create(
              name: attrs[:name],
              description: attrs[:description],
              created_by: creator.id,
              member_ids: [creator.id]
            )
          end
          channel
        end

        def self.add_member(channel, user)
          return true if channel.member_ids&.include?(user.id)

          # Add user to channel member array
          current_members = channel.member_ids || []
          channel.update(member_ids: current_members + [user.id])

          # Publish join event to PubNub
          pubnub_service = Chat::Services::Pubnub.new
          pubnub_service.publish(
            channel.id.to_s,
            {
              action: 'join',
              user: Chat::REST::Representers::User.new(user).to_hash
            }
          )

          true
        end

        def self.is_member?(channel, user)
          channel.member_ids&.include?(user.id) || false
        end
      end
    end
  end
end
