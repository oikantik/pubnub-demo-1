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
        # Log incoming request
        puts "Login request received for user: #{params[:name]}"

        # Login or create user and get auth token
        user, token = Chat::Services::User.login(params[:name])
        puts "User authenticated: #{user.id}, token: #{token}"

        # Ensure user ID and token are present
        unless user && token
          error!('Failed to authenticate user', 500)
        end

        begin
          # Generate PubNub token for the user with a forced refresh
          pubnub_token = Chat::Services::Pubnub.instance.generate_token(user.id, true)
          puts "PubNub token generated: #{pubnub_token ? 'success' : 'failed'}"

          unless pubnub_token
            # For demo purposes, if token generation fails, use a dummy token
            puts "Token generation failed, using a fallback dummy token for user #{user.id}"
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

          puts "Login response prepared with token and PubNub token"
          response
        rescue => e
          puts "Error in login endpoint: #{e.class.name} - #{e.message}"
          puts e.backtrace.join("\n")
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

      # Note: The order of these routes is important
      # Put more specific routes (like 'channels') before general parameter routes (like :id)
      # to avoid routing conflicts

      desc 'Get user channels'
      get :channels do
        authenticate!
        puts "Fetching channels for user: #{current_user.id}"

        # Get channels user is a member of
        channels = Chat::Services::Channel.get_user_channels(current_user)
        puts "Found #{channels.length} channels for user #{current_user.id}"

        present_collection_with(channels, Chat::REST::Representers::Channel)
      end

      desc 'Create or join a channel'
      params do
        requires :name, type: String, desc: 'Channel name'
      end
      post :channels do
        authenticate!
        puts "Creating/joining channel '#{params[:name]}' for user: #{current_user.id}"

        # Check if channel exists
        channel = Chat::Models::Channel.find(name: params[:name])

        if channel
          # Join existing channel
          puts "Channel '#{params[:name]}' exists, adding user as member"
          Chat::Services::Channel.add_member(channel, current_user)
        else
          # Create new channel with current user as creator/member
          puts "Channel '#{params[:name]}' does not exist, creating new channel"
          channel = Chat::Services::Channel.create_with_creator({
            name: params[:name]
          }, current_user)
        end

        error!('Failed to create or join channel', 500) unless channel

        puts "Successfully processed channel '#{params[:name]}' for user #{current_user.id}"
        # Return channel information
        present_with(channel, Chat::REST::Representers::Channel)
      end

      desc 'Get user information'
      params do
        requires :id, type: String, desc: 'User ID'
      end
      get ':id' do
        authenticate!
        puts "Fetching user information for ID: #{params[:id]}"

        user = Chat::Models::User[params[:id]]
        error!('User not found', 404) unless user

        present_with(user, Chat::REST::Representers::User)
      end
    end
  end
end
