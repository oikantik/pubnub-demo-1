# frozen_string_literal: true

require 'grape'

module Chat::REST
  class Ping < Grape::API
    format :json

    helpers Chat::REST::Helpers

    desc 'Ping the API'
    get :ping do
      { ping: 'pong' }
    end
  end
end
