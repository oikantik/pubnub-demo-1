# frozen_string_literal: true

require 'grape'

module Chat::REST
  class Tokens < Grape::API
    helpers Chat::REST::Helpers

    format :json
    version 'v1', using: :path

    resource :tokens do
      before do
        authenticate!
      end

      desc 'Generate a PubNub access token'
      post :pubnub do
        # Generate token (already stored in Redis by the service)
        token = Chat::Services::Pubnub.instance.generate_token(current_user.id)
        error!('Failed to generate token', 500) unless token

        present_with(Object.new, Chat::REST::Representers::Token, token: token)
      end
    end

    resource :presence do
      before do
        authenticate!
      end

      desc 'Get presence information for a channel'
      params do
        requires :channel, type: String, desc: 'The channel ID to check presence for'
      end
      get do
        channel = params[:channel]

        # Check if user has access to this channel
        user_channels = Chat::Services::Channel.get_user_channels(current_user)
        channel_ids = user_channels.map { |c| c.id.to_s }

        # Ensure user has access to the channel
        error!('Unauthorized access to channel', 403) unless channel_ids.include?(channel)

        # Get presence information from PubNub
        token = request.headers['Authorization']&.split(' ')&.last
        uuids = Chat::Services::Pubnub.instance.presence_on_channel(channel, auth_token: token)

        error!('Failed to get presence information', 500) if uuids.nil?

        { uuids: uuids }
      end
    end
  end
end
