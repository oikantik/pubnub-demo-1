# frozen_string_literal: true

require 'grape'

module Chat::REST
  class Channels < Grape::API
    version 'v1', using: :path
    format :json

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
        channel = Chat::Services::Operations::Channel.create_with_creator(
          {
            name: params[:name],
            description: params[:description]
          },
          current_user
        )

        # Publish channel creation to PubNub
        pubnub_service = Chat::Services::Pubnub.new
        pubnub_service.publish(
          'channel-updates',
          {
            action: 'create',
            channel: Chat::REST::Representers::Channel.new(channel).to_hash
          }
        )

        Chat::REST::Representers::Channel.new(channel).to_hash
      end

      desc 'Join a channel'
      params do
        requires :id, type: String, desc: 'Channel ID'
      end
      post ':id/join' do
        channel = Chat::Models::Channel[params[:id]]
        error!('Channel not found', 404) unless channel

        # Add user to channel
        Chat::Services::Operations::Channel.add_member(channel, current_user)

        { success: true }
      end

      desc 'Get channel details'
      params do
        requires :id, type: String, desc: 'Channel ID'
      end
      get ':id' do
        channel = Chat::Models::Channel[params[:id]]
        error!('Channel not found', 404) unless channel

        # Check if user is a member
        is_member = Chat::Services::Operations::Channel.is_member?(channel, current_user)
        error!('You are not a member of this channel', 403) unless is_member

        Chat::REST::Representers::Channel.new(channel, include_members: true).to_hash
      end

      desc 'List all channels for a user'
      get do
        # Find all channels where current user is a member
        channels = Chat::Models::Channel.where(
          Sequel.lit("member_ids @> ARRAY[?]::uuid[]", current_user.id)
        ).all

        channels.map do |channel|
          Chat::REST::Representers::Channel.new(channel).to_hash
        end
      end
    end
  end
end
