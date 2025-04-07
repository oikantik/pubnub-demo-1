# frozen_string_literal: true

require 'grape'

module Chat::REST
  class Messages < Grape::API
    helpers Chat::REST::Helpers

    format :json
    version 'v1', using: :path

    resource :messages do
      before do
        authenticate!
      end

      desc 'Send a message to a channel'
      params do
        requires :channel_id, type: String, desc: 'Channel ID or channel name'
        requires :text, type: String, desc: 'Message text'
      end
      post do
        # Try to find channel by ID first, then by name if not a valid UUID
        begin
          channel = Chat::Models::Channel[params[:channel_id]]
        rescue => e
          channel = nil
        end

        # If not found by ID, try by name
        if channel.nil?
          channel = Chat::Models::Channel.find(name: params[:channel_id])
        end

        error!('Channel not found', 404) unless channel

        # Check if user is a member
        is_member = Chat::Services::Channel.is_member?(channel, current_user)
        error!('You are not a member of this channel', 403) unless is_member

        # Create and save the message
        begin
          message = Chat::Services::Message.create_in_channel(
            channel,
            current_user,
            params[:text]
          )
          present_with(message, Chat::REST::Representers::Message)
        rescue => e
          error!("Failed to create message: #{e.message}", 500)
        end
      end
    end
  end
end
