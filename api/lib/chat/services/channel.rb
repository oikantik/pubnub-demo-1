# frozen_string_literal: true

module Chat
  module Services
    class Channel
      def self.create_with_creator(attrs, creator)
        channel = nil
        Chat::DB.transaction do
          channel = Chat::Models::Channel.create(
            name: attrs[:name],
            description: attrs[:description],
            created_by: creator.id
          )
          channel.add_user(creator)
        end

        # Publish channel creation notification
        Chat::Services::Pubnub.notify_channel_members(channel, creator)

        channel
      end

      def self.add_member(channel, user)
        return true if is_member?(channel, user)

        # Add user to channel
        channel.add_user(user)

        # Publish join event
        Chat::Services::Pubnub.notify_channel_join(channel, user)

        true
      end

      def self.is_member?(channel, user)
        channel.users_dataset.where(id: user.id).count > 0
      end

      def self.get_members(channel)
        channel.users
      end

      def self.get_user_channels(user)
        user.channels
      end
    end
  end
end
