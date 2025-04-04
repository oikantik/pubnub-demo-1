# frozen_string_literal: true

require 'grape'
require 'grape/roar/formatter'
require 'chat/rest/ping'
require 'chat/rest/messages'

module Chat::REST
  class Root < Grape::API
    content_type :json, 'application/json'
    formatter :json, Grape::Formatter::Roar

    default_format :json
    default_error_formatter :json

    mount Chat::REST::Ping
    mount Chat::REST::Messages
  end
end
