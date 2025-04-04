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
      params do
        optional :ttl, type: Integer, default: 86400, desc: 'Token time-to-live in seconds (default: 24 hours)'
      end
      post :pubnub do
        pubnub_service = Chat::Services::Pubnub.new
        token = pubnub_service.generate_token(current_user.id, params[:ttl])

        {
          token: token,
          ttl: params[:ttl]
        }
      end
    end
  end
end
