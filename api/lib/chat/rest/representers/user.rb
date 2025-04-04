# frozen_string_literal: true

require 'roar/decorator'
require 'roar/json'
require_relative 'base'

module Chat
  module REST
    module Representers
      class User < Base
        property :id
        property :name
        property :created_at
        property :updated_at
        property :status, exec_context: :decorator

        def status
          Chat::Services::Redis.get_online_status(represented.id) || 'offline'
        end
      end
    end
  end
end
