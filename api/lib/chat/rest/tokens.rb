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
        # First check if token already exists in Redis
        existing_token = Chat::Services::Redis.get_pubnub_token(current_user.id)
        if existing_token
          return present_with(Object.new, Chat::REST::Representers::Token, token: existing_token)
        end

        # Generate token (force refresh to ensure we get a new valid token)
        token = Chat::Services::Pubnub.instance.generate_token(current_user.id, true)

        unless token
          error!('Failed to generate token', 500)
        end

        present_with(Object.new, Chat::REST::Representers::Token, token: token)
      end

      desc 'Refresh a PubNub access token'
      put :refresh do
        # Generate new token with forced refresh
        token = Chat::Services::Pubnub.instance.generate_token(current_user.id, true)

        unless token
          error!('Failed to refresh token', 500)
        end

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
        unless channel_ids.include?(channel)
          error!('Unauthorized access to channel', 403)
        end

        # Get presence information from PubNub
        token = request.headers['Authorization']&.split(' ')&.last
        uuids = Chat::Services::Pubnub.instance.presence_on_channel(channel, auth_token: token)

        if uuids.nil?
          error!('Failed to get presence information', 500)
        end

        { uuids: uuids }
      end
    end
  end
end
