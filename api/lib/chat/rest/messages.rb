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
        begin
          channel = Chat::Models::Channel[params[:channel_id]]
        rescue => e
          puts "Error looking up channel by ID: #{e.class.name} - #{e.message}"
          puts e.backtrace.join("\n")
          channel = nil
        end

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
        begin
          message = Chat::Services::Message.create_in_channel(
            channel,
            current_user,
            params[:text]
          )
          present_with(message, Chat::REST::Representers::Message)
        rescue => e
          puts "Error creating message: #{e.class.name} - #{e.message}"
          puts e.backtrace.join("\n")
          error!("Failed to create message: #{e.message}", 500)
        end
      end

      desc 'Get messages for a channel'
      params do
        requires :channel_id, type: String, desc: 'Channel ID'
        optional :limit, type: Integer, default: 50, desc: 'Limit number of messages'
        optional :offset, type: Integer, default: 0, desc: 'Offset for pagination'
      end
      get do
        # Try to find channel by ID first, then by name if not a valid UUID
        begin
          channel = Chat::Models::Channel[params[:channel_id]]
        rescue => e
          puts "Error looking up channel by ID: #{e.class.name} - #{e.message}"
          puts e.backtrace.join("\n")
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

        # Get messages for channel
        begin
          messages = Chat::Services::Message.get_for_channel(
            channel,
            limit: params[:limit],
            offset: params[:offset]
          )
          present_collection_with(messages, Chat::REST::Representers::Message)
        rescue => e
          puts "Error fetching messages: #{e.class.name} - #{e.message}"
          puts e.backtrace.join("\n")
          error!("Failed to fetch messages: #{e.message}", 500)
        end
      end
    end

    # Move history endpoint to its own resource to avoid routing conflicts
    resource :channels do
      before do
        authenticate!
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
