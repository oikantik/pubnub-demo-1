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
        puts "Token generation request for user: #{current_user.id}"

        # First check if token already exists in Redis
        existing_token = Chat::Services::Redis.get_pubnub_token(current_user.id)
        if existing_token
          puts "Using existing token for user #{current_user.id}"
          return present_with(Object.new, Chat::REST::Representers::Token, token: existing_token)
        end

        # Generate token (force refresh to ensure we get a new valid token)
        token = Chat::Services::Pubnub.instance.generate_token(current_user.id, true)

        unless token
          puts "Failed to generate token for user #{current_user.id}"
          error!('Failed to generate token', 500)
        end

        puts "Successfully generated token for user #{current_user.id}"
        present_with(Object.new, Chat::REST::Representers::Token, token: token)
      end

      desc 'Refresh a PubNub access token'
      put :refresh do
        puts "Token refresh request for user: #{current_user.id}"

        # Generate new token with forced refresh
        token = Chat::Services::Pubnub.instance.generate_token(current_user.id, true)

        unless token
          puts "Failed to refresh token for user #{current_user.id}"
          error!('Failed to refresh token', 500)
        end

        puts "Successfully refreshed token for user #{current_user.id}"
        present_with(Object.new, Chat::REST::Representers::Token, token: token)
      end

      desc 'Revoke a PubNub access token'
      delete :revoke do
        # Get current token from header
        token = request.headers['Authorization']&.split(' ')&.last
        return error!('No token provided', 400) unless token

        puts "Token revocation request for user: #{current_user.id}, token: #{token}"

        # Revoke token
        success = Chat::Services::Pubnub.instance.revoke_token(token)

        unless success
          puts "Failed to revoke token for user #{current_user.id}"
          error!('Failed to revoke token', 500)
        end

        puts "Successfully revoked token for user #{current_user.id}"
        present_with(Object.new, Chat::REST::Representers::Success, message: 'Token revoked')
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
        puts "Presence request for channel: #{channel} from user: #{current_user.id}"

        # Check if user has access to this channel
        user_channels = Chat::Services::Channel.get_user_channels(current_user)
        channel_ids = user_channels.map { |c| c.id.to_s }

        # Ensure user has access to the channel
        unless channel_ids.include?(channel)
          puts "User #{current_user.id} doesn't have access to channel #{channel}"
          error!('Unauthorized access to channel', 403)
        end

        # Get presence information from PubNub
        token = request.headers['Authorization']&.split(' ')&.last
        uuids = Chat::Services::Pubnub.instance.presence_on_channel(channel, auth_token: token)

        if uuids.nil?
          puts "Failed to get presence information for channel #{channel}"
          error!('Failed to get presence information', 500)
        end

        puts "Successfully retrieved presence for channel #{channel}: #{uuids.length} users"
        { uuids: uuids }
      end
    end
  end
end
