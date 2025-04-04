# frozen_string_literal: true

require 'grape'

module Chat::REST
  class Tokens < Grape::API
    version 'v1', using: :path
    format :json

    helpers Chat::REST::Helpers

    resource :tokens do
      before do
        authenticate!
      end

      desc 'Generate a PubNub access token'
      post :pubnub do
        # Generate token (already stored in Redis by the service)
        token = Chat::Services::Pubnub.generate_token(current_user.id)
        error!('Failed to generate token', 500) unless token

        present_with(Object.new, Chat::REST::Representers::Token, token: token)
      end
    end
  end
end
