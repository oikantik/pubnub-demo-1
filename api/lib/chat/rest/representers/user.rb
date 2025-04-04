# frozen_string_literal: true

require 'roar/decorator'
require 'roar/json'

module Chat
  module REST
    module Representers
      class User < Roar::Decorator
        include Roar::JSON

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
