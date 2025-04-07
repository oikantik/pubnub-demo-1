# frozen_string_literal: true

module Chat
  module Services
    # Channel service handling channel-related operations
    # including creation, membership management, and access controls
    class Channel
      # Create a new channel with a specified creator who automatically becomes a member
      #
      # @param attrs [Hash] The attributes for the new channel
      # @param creator [Chat::Models::User] The user creating the channel
      # @return [Chat::Models::Channel, nil] The created channel or nil if creation failed
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

        # Grant channel access in PubNub for the creator
        Chat::Services::Pubnub.instance.grant_channel_access(creator.id, channel.id) if channel

        channel
      end

      # Add a user as a member to a channel
      #
      # @param channel [Chat::Models::Channel] The channel to add the user to
      # @param user [Chat::Models::User] The user to add as a member
      # @return [Boolean] True if the user was added or is already a member
      def self.add_member(channel, user)
        return true if is_member?(channel, user)

        # Add user to channel
        channel.add_user(user)

        # Grant channel access in PubNub for the user
        Chat::Services::Pubnub.instance.grant_channel_access(user.id, channel.id)

        true
      end

      # Check if a user is a member of a channel
      #
      # @param channel [Chat::Models::Channel] The channel to check membership for
      # @param user [Chat::Models::User] The user to check
      # @return [Boolean] True if the user is a member of the channel
      def self.is_member?(channel, user)
        channel.users_dataset.where(id: user.id).count > 0
      end

      # Get all members of a channel
      #
      # @param channel [Chat::Models::Channel] The channel to get members for
      # @return [Array<Chat::Models::User>] The users who are members of the channel
      def self.get_members(channel)
        channel.users
      end

      # Get all channels a user is a member of
      #
      # @param user [Chat::Models::User] The user to get channels for
      # @return [Array<Chat::Models::Channel>] The channels the user is a member of
      def self.get_user_channels(user)
        user.channels
      end
    end
  end
end
