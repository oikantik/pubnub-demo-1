# frozen_string_literal: true

require 'grape'
require 'grape/roar/formatter'
require 'grape-swagger'

module Chat::REST
  module Helpers
    def current_user
      token = headers['Authorization']&.split(' ')&.last
      return nil unless token

      user_id = Chat::Services::Redis.get_user_from_token(token)
      return nil unless user_id

      Chat::Models::User[user_id]
    end

    def authenticate!
      error!('Unauthorized', 401) unless current_user
    end

    def present_with(model, representer_class, options = {})
      representer_class.new(model, options).to_hash
    end

    def present_collection_with(collection, representer_class, options = {})
      collection.map { |item| present_with(item, representer_class, options) }
    end
  end
end

# Load REST endpoints before mounting them
require 'chat/rest/ping'
require 'chat/rest/users'
require 'chat/rest/channels'
require 'chat/rest/messages'
require 'chat/rest/tokens'

module Chat::REST
  class Root < Grape::API
    content_type :json, 'application/json'
    formatter :json, Grape::Formatter::Roar

    helpers Helpers

    default_format :json
    default_error_formatter :json

    mount Chat::REST::Ping
    mount Chat::REST::Messages
    mount Chat::REST::Users
    mount Chat::REST::Channels
    mount Chat::REST::Tokens

    add_swagger_documentation(
      api_version: 'v1',
      mount_path: '/docs'
    )
  end
end
