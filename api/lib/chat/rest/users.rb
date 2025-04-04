# frozen_string_literal: true

require 'grape'

module Chat::REST
  class Users < Grape::API
    format :json
    version 'v1', using: :path

    helpers Chat::REST::Helpers

    resource :users do
      desc 'Login or create a user'
      params do
        requires :name, type: String, desc: 'User name'
      end
      post :login do
        user, token = Chat::Services::User.login(params[:name])

        present_with(user, Chat::REST::Representers::User).merge(token: token)
      end

      desc 'Logout current user'
      delete :logout do
        authenticate!

        Chat::Services::User.logout(current_user)

        present_with(Object.new, Chat::REST::Representers::Success, message: 'Logged out successfully')
      end

      desc 'Get user information'
      params do
        requires :id, type: String, desc: 'User ID'
      end
      get ':id' do
        authenticate!

        user = Chat::Models::User[params[:id]]
        error!('User not found', 404) unless user

        present_with(user, Chat::REST::Representers::User)
      end
    end
  end
end
