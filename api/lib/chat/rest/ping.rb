# frozen_string_literal: true

module Chat::REST
  class Ping < Grape::API
    get '/ping' do
      { message: 'pong' }
    end
  end
end
