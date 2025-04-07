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
        user, token = Chat::Services::User.login(params[:name].to_s.downcase)

        # Ensure user ID and token are present
        unless user && token
          error!('Failed to authenticate user', 500)
        end

        begin
          # Prepare and return the response
          response = present_with(user, Chat::REST::Representers::User).merge(
            token: token
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
    end
  end
end
