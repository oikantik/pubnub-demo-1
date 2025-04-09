# frozen_string_literal: true

require 'grape'

module Chat::REST
  class Channels < Grape::API
    format :json
    version 'v1', using: :path
    content_type :json, "application/json"

    helpers Chat::REST::Helpers

    resource :channels do
      before do
        authenticate!
      end

      desc 'Create a new channel'
      params do
        requires :name, type: String, desc: 'Channel name'
        optional :description, type: String, desc: 'Channel description'
      end
      post do
        channel = Chat::Services::Channel.create_with_creator(
          {
            name: params[:name],
            description: params[:description]
          },
          current_user
        )

        present_with(channel, Chat::REST::Representers::Channel)
      end

      desc 'Get all available channels'
      get do
        channels = Chat::Models::Channel.all

        # Get the user's channels to mark which ones they've joined
        user_channels = Chat::Services::Channel.get_user_channels(current_user)
        user_channel_ids = user_channels.map(&:id)

        # Present channels with additional joined flag
        channels.map do |channel|
          channel_hash = present_with(channel, Chat::REST::Representers::Channel)
          channel_hash[:joined] = user_channel_ids.include?(channel.id)
          channel_hash
        end
      end

      desc 'Join a channel'
      params do
        requires :id, type: String, desc: 'Channel ID to join'
      end
      post ':id/join' do
        # Find channel
        begin
          channel = Chat::Models::Channel[params[:id]]
        rescue => e
          error!('Channel not found', 404)
        end

        error!('Channel not found', 404) unless channel

        # Check if user is already a member
        is_member = Chat::Services::Channel.is_member?(channel, current_user)

        if is_member
          # Return success but indicate no change
          present_with(channel, Chat::REST::Representers::Channel).merge(
            joined: true,
            already_member: true
          )
        else
          # Add user to channel
          begin
            Chat::Services::Channel.add_member(channel, current_user)
            present_with(channel, Chat::REST::Representers::Channel).merge(
              joined: true,
              already_member: false
            )
          rescue => e
            error!("Failed to join channel: #{e.message}", 500)
          end
        end
      end

      desc 'Get channel details'
      params do
        requires :id, type: String, desc: 'Channel ID'
      end
      get ':id' do
        channel = Chat::Models::Channel[params[:id]]
        error!('Channel not found', 404) unless channel

        # Check if user is a member
        is_member = Chat::Services::Channel.is_member?(channel, current_user)
        error!('You are not a member of this channel', 403) unless is_member

        present_with(channel, Chat::REST::Representers::Channel)
      end

      desc 'List all channels for the current user'
      get do
        channels = Chat::Services::Channel.get_user_channels(current_user)

        present_collection_with(channels, Chat::REST::Representers::Channel)
      end

      desc 'Get message history for a channel by ID'
      params do
        requires :id, type: String, desc: 'Channel ID'
        optional :limit, type: Integer, default: 50, desc: 'Limit number of messages'
      end
      get ':id/history' do
        begin
          # First try to find by ID
          channel = nil

          # Use a begin/rescue block to properly handle potential UUID errors
          begin
            channel = Chat::Models::Channel[params[:id]]
          rescue => e
            # Silently handle the error
          end

          # If not found by ID, try by name as fallback
          if channel.nil?
            channel = Chat::Models::Channel.find(name: params[:id])
          end

          error!('Channel not found', 404) unless channel

          # Check if user is a member
          is_member = Chat::Services::Channel.is_member?(channel, current_user)
          error!('You are not a member of this channel', 403) unless is_member

          # Get messages for channel
          messages = Chat::Services::Message.get_for_channel(
            channel,
            limit: params[:limit]
          )

          # Use the Message representer to format the collection
          present_collection_with(messages, Chat::REST::Representers::Message)

        rescue Sequel::InvalidValue => e
          # Handle specific error for invalid UUID format
          error!("Invalid channel ID format: #{params[:id]}", 400)
        rescue => e
          log_message("Failed to fetch channel history for #{params[:id]}: #{e.message}")
          error!("Failed to fetch channel history", 500)
        end
      end

      desc 'Get presence information for a channel'
      params do
        requires :id, type: String, desc: 'The channel ID to check presence for'
      end
      get ':id/presence' do
        begin
          channel = Chat::Models::Channel[params[:id]]
          error!('Channel not found', 404) unless channel

          # Check if user is a member
          is_member = Chat::Services::Channel.is_member?(channel, current_user)
          error!('You are not a member of this channel', 403) unless is_member

          # Get presence information from PubNub
          token = request.headers['Authorization']&.split(' ')&.last
          uuids = Chat::Services::Pubnub.instance.presence_on_channel(channel.id.to_s, auth_token: token)

          if uuids.nil?
            error!('Failed to get presence information', 500)
          end

          { uuids: uuids }
        rescue => e
          error!("Failed to get presence information: #{e.message}", 500)
        end
      end
    end
  end
end
