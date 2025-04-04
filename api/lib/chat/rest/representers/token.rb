# frozen_string_literal: true

require 'roar/decorator'
require 'roar/json'

module Chat
  module REST
    module Representers
      class Token < Roar::Decorator
        include Roar::JSON

        property :token, exec_context: :decorator

        def token
          options[:token]
        end
      end
    end
  end
end
