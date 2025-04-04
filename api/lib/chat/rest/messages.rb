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
        puts "Sending message to channel: #{params[:channel_id]}"

        # Try to find channel by ID first, then by name if not a valid UUID
        channel = Chat::Models::Channel[params[:channel_id]] rescue nil

        # If not found by ID, try by name
        if channel.nil?
          puts "Channel not found by ID, trying by name: #{params[:channel_id]}"
          channel = Chat::Models::Channel.find(name: params[:channel_id])
        end

        error!('Channel not found', 404) unless channel
        puts "Channel found: #{channel.name} (#{channel.id})"

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
        # Try to find channel by ID first, then by name if not a valid UUID
        channel = Chat::Models::Channel[params[:channel_id]] rescue nil

        # If not found by ID, try by name
        if channel.nil?
          channel = Chat::Models::Channel.find(name: params[:channel_id])
        end

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

      # Endpoint for channel history by name (useful for frontend integration)
      desc 'Get message history for a channel by name'
      params do
        requires :channel, type: String, desc: 'Channel name'
        optional :limit, type: Integer, default: 50, desc: 'Limit number of messages'
      end
      get ':channel/history' do
        # Find the channel
        channel = Chat::Models::Channel.find(name: params[:channel])
        error!('Channel not found', 404) unless channel

        # Check if user is a member
        is_member = Chat::Services::Channel.is_member?(channel, current_user)
        error!('You are not a member of this channel', 403) unless is_member

        # Get messages for channel
        messages = Chat::Services::Message.get_for_channel(
          channel,
          limit: params[:limit]
        )

        # Format the messages for the frontend format
        messages.map do |msg|
          {
            message: msg.text,
            sender: msg.sender.name,
            timestamp: msg.created_at.to_i,
            channel: channel.name,
            id: msg.id.to_s
          }
        end
      end
    end
  end
end
