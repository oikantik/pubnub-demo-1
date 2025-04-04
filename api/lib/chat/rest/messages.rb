# frozen_string_literal: true

require 'grape'

module Chat::REST
  class Messages < Grape::API
    version 'v1', using: :path
    format :json

    helpers Chat::REST::Helpers

    resource :messages do
      before do
        authenticate!
      end

      desc 'Send a message to a channel'
      params do
        requires :channel_id, type: String, desc: 'Channel ID'
        requires :message, type: String, desc: 'Message text'
      end
      post do
        channel = Chat::Models::Channel[params[:channel_id]]
        error!('Channel not found', 404) unless channel

        # Check if user is a member of the channel
        is_member = Chat::Services::Operations::Channel.is_member?(channel, current_user)
        error!('You are not a member of this channel', 403) unless is_member

        # Create message
        begin
          message = Chat::Services::Operations::Message.create_in_channel(
            params[:message],
            current_user,
            channel
          )

          # Return message
          Chat::REST::Representers::Message.new(message).to_hash
        rescue => e
          error!(e.message, 400)
        end
      end

      desc 'Get messages from a channel'
      params do
        requires :channel_id, type: String, desc: 'Channel ID'
        optional :before, type: Integer, desc: 'Get messages before this timestamp'
        optional :limit, type: Integer, default: 50, desc: 'Number of messages to return'
      end
      get do
        channel = Chat::Models::Channel[params[:channel_id]]
        error!('Channel not found', 404) unless channel

        # Check if user is a member of the channel
        is_member = Chat::Services::Operations::Channel.is_member?(channel, current_user)
        error!('You are not a member of this channel', 403) unless is_member

        # Get messages
        messages = Chat::Services::Operations::Message.get_channel_messages(
          channel,
          params[:before],
          params[:limit]
        )

        messages.map do |message|
          Chat::REST::Representers::Message.new(message, include_sender: true).to_hash
        end
      end
    end
  end
end
