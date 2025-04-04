# frozen_string_literal: true

require 'grape'

module Chat::REST
  class Channels < Grape::API
    format :json
    version 'v1', using: :path

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

      desc 'Join a channel'
      params do
        requires :id, type: String, desc: 'Channel ID'
      end
      post ':id/join' do
        channel = Chat::Models::Channel[params[:id]]
        error!('Channel not found', 404) unless channel

        # Add user to channel
        Chat::Services::Channel.add_member(channel, current_user)

        present_with(Object.new, Chat::REST::Representers::Success, message: 'Joined channel successfully')
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
    end
  end
end
