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
        publish_channel_creation(channel, creator)

        channel
      end

      def self.add_member(channel, user)
        return true if is_member?(channel, user)

        # Add user to channel
        channel.add_user(user)

        # Publish join event
        publish_member_joined(channel, user)

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

      private

      # Publish notification about channel creation
      def self.publish_channel_creation(channel, creator)
        representer = Chat::REST::Representers::Channel.new(channel)
        Chat::Services::Pubnub.instance.publish(
          channel: Chat::Services::Pubnub::CHANNEL_UPDATES,
          message: {
            event: 'channel_created',
            channel: representer.to_hash,
            creator: Chat::REST::Representers::User.new(creator).to_hash
          }
        )
      end

      # Publish notification about user joining a channel
      def self.publish_member_joined(channel, user)
        representer = Chat::REST::Representers::User.new(user)
        Chat::Services::Pubnub.instance.publish(
          channel: channel.id.to_s,
          message: {
            event: 'user_joined',
            user: representer.to_hash
          }
        )
      end
    end
  end
end
