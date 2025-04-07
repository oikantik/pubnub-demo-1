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
    end
  end
end
