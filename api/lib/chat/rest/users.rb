# frozen_string_literal: true

require 'grape'

module Chat::REST
  class Users < Grape::API
    helpers Chat::REST::Helpers

    format :json
    version 'v1', using: :path
    content_type :json, "application/json"

    resource :users do
      desc 'Login or create a user'
      params do
        requires :name, type: String, desc: 'User name'
      end
      post :login do
        # Login or create user and get auth token
        user, token = Chat::Services::User.login(params[:name])

        # Ensure user ID and token are present
        unless user && token
          error!('Failed to authenticate user', 500)
        end

        begin
          # Generate PubNub token for the user with a forced refresh
          pubnub_token = Chat::Services::Pubnub.instance.generate_token(user.id, true)

          unless pubnub_token
            # For demo purposes, if token generation fails, use a dummy token
            # Generate a temporary dummy token for testing
            pubnub_token = "demo-token-#{SecureRandom.hex(8)}"
            # Cache it in Redis
            Chat::Services::Redis.set_pubnub_token(user.id, pubnub_token)
            Chat::Services::Redis.set_user_token(user.id, pubnub_token)
          end

          # Prepare and return the response
          response = present_with(user, Chat::REST::Representers::User).merge(
            token: token,
            pubnub_token: pubnub_token
          )

          response
        rescue => e
          error!("Login failed: #{e.message}", 500)
        end
      end

      desc 'Logout current user'
      delete :logout do
        authenticate!

        # Get current token
        auth_token = request.headers['Authorization']&.split(' ')&.last
        if auth_token
          # Get PubNub token for user
          pubnub_token = Chat::Services::Redis.get_pubnub_token(current_user.id)

          # Revoke PubNub token if exists
          if pubnub_token
            Chat::Services::Pubnub.instance.revoke_token(pubnub_token)
          end

          # Logout user
          Chat::Services::User.logout(current_user)
        end

        present_with(Object.new, Chat::REST::Representers::Success, message: 'Logged out successfully')
      end

      desc 'Get current user information'
      get :me do
        authenticate!

        # Return current authenticated user
        present_with(current_user, Chat::REST::Representers::User)
      end

      desc 'Create or join a channel'
      params do
        requires :name, type: String, desc: 'Channel name'
      end
      post :channels do
        authenticate!

        # Check if channel exists
        channel = Chat::Models::Channel.find(name: params[:name])

        if channel
          # Join existing channel
          Chat::Services::Channel.add_member(channel, current_user)
        else
          # Create new channel with current user as creator/member
          channel = Chat::Services::Channel.create_with_creator({
            name: params[:name]
          }, current_user)
        end

        error!('Failed to create or join channel', 500) unless channel

        # Return channel information
        present_with(channel, Chat::REST::Representers::Channel)
      end
    end
  end
end
