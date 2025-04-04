# frozen_string_literal: true

require 'grape'

module Chat::REST
  class Users < Grape::API
    version 'v1', using: :path
    format :json

    helpers Chat::REST::Helpers

    resource :users do
      desc 'Login or create a user'
      params do
        requires :name, type: String, desc: 'User name'
      end
      post :login do
        user, token = Chat::Services::Operations::User.login(params[:name])

        {
          user: Chat::REST::Representers::User.new(user).to_hash,
          token: token
        }
      end

      desc 'Get user information'
      params do
        requires :id, type: String, desc: 'User ID'
      end
      get ':id' do
        authenticate!

        user = Chat::Models::User[params[:id]]
        error!('User not found', 404) unless user

        Chat::REST::Representers::User.new(user).to_hash
      end
    end
  end
end
