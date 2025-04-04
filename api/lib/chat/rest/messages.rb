# frozen_string_literal: true

require 'grape'

module Chat::REST
  class Messages < Grape::API
    format :json
    version 'v1', using: :path

    helpers Chat::REST::Helpers

    resource :messages do
      before do
        authenticate!
      end

      desc 'Send a message to a channel'
      params do
        requires :channel_id, type: String, desc: 'Channel ID'
        requires :text, type: String, desc: 'Message text'
      end
      post do
        channel = Chat::Models::Channel[params[:channel_id]]
        error!('Channel not found', 404) unless channel

        # Check if user is a member
        is_member = Chat::Services::Channel.is_member?(channel, current_user)
        error!('You are not a member of this channel', 403) unless is_member

        # Create and save the message
        message = Chat::Services::Message.create_in_channel(
          channel,
          current_user,
          params[:text]
        )

        present_with(message, Chat::REST::Representers::Message)
      end

      desc 'Get messages for a channel'
      params do
        requires :channel_id, type: String, desc: 'Channel ID'
        optional :limit, type: Integer, default: 50, desc: 'Limit number of messages'
        optional :offset, type: Integer, default: 0, desc: 'Offset for pagination'
      end
      get do
        channel = Chat::Models::Channel[params[:channel_id]]
        error!('Channel not found', 404) unless channel

        # Check if user is a member
        is_member = Chat::Services::Channel.is_member?(channel, current_user)
        error!('You are not a member of this channel', 403) unless is_member

        # Get messages for channel
        messages = Chat::Services::Message.get_for_channel(
          channel,
          limit: params[:limit],
          offset: params[:offset]
        )

        present_collection_with(messages, Chat::REST::Representers::Message)
      end
    end
  end
end
