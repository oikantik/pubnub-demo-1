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
        puts "Fetching all available channels"
        channels = Chat::Models::Channel.all
        puts "Found #{channels.length} total channels"

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
        puts "User #{current_user.id} attempting to join channel #{params[:id]}"

        # Find channel
        begin
          channel = Chat::Models::Channel[params[:id]]
        rescue => e
          puts "Error looking up channel by ID: #{e.class.name} - #{e.message}"
          puts e.backtrace.join("\n")
          error!('Channel not found', 404)
        end

        error!('Channel not found', 404) unless channel

        # Check if user is already a member
        is_member = Chat::Services::Channel.is_member?(channel, current_user)

        if is_member
          puts "User is already a member of this channel"
          # Return success but indicate no change
          present_with(channel, Chat::REST::Representers::Channel).merge(
            joined: true,
            already_member: true
          )
        else
          # Add user to channel
          begin
            Chat::Services::Channel.add_member(channel, current_user)
            puts "User added to channel successfully"
            present_with(channel, Chat::REST::Representers::Channel).merge(
              joined: true,
              already_member: false
            )
          rescue => e
            puts "Error adding user to channel: #{e.class.name} - #{e.message}"
            puts e.backtrace.join("\n")
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

        present_with(channel, Chat::REST::Representers::Channel, include_members: true)
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
          puts "Fetching message history for channel ID: #{params[:id]}"
          # First try to find by ID
          channel = nil

          # Use a begin/rescue block to properly handle potential UUID errors
          begin
            channel = Chat::Models::Channel[params[:id]]
            puts "Found channel by ID: #{channel&.id}"
          rescue => e
            puts "Error finding channel by ID: #{e.class.name} - #{e.message}"
            puts e.backtrace.join("\n")
          end

          # If not found by ID, try by name as fallback
          if channel.nil?
            puts "Channel not found by ID, trying by name: #{params[:id]}"
            channel = Chat::Models::Channel.find(name: params[:id])
            puts "Found channel by name: #{channel&.id}" if channel
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

          puts "Found #{messages.length} messages for channel #{channel.id}"

          # Format the messages for the frontend format
          formatted_messages = messages.map do |msg|
            {
              message: msg.text,
              sender: msg.sender.name,
              timestamp: msg.created_at.to_i,
              channel: channel.name,
              channel_id: channel.id.to_s,
              id: msg.id.to_s
            }
          end

          puts "Returning #{formatted_messages.length} formatted messages"
          formatted_messages
        rescue => e
          puts "Error in channel history: #{e.class.name} - #{e.message}"
          puts e.backtrace.join("\n")
          error!("Failed to fetch channel history: #{e.message}", 500)
        end
      end
    end
  end
end
