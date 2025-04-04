# frozen_string_literal: true

require 'grape'

module Chat::REST
  class Ping < Grape::API
    format :json

    get :ping do
      { ping: 'pong' }
    end
  end
end
