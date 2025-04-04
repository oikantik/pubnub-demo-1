# frozen_string_literal: true

require 'roar/decorator'
require 'roar/json'

module Chat
  module REST
    module Representers
      class Success < Roar::Decorator
        include Roar::JSON

        property :success, exec_context: :decorator

        def success
          true
        end

        property :message, exec_context: :decorator, if: ->(_) { exec_context.message? }

        def message?
          options[:message].present?
        end

        def message
          options[:message]
        end
      end
    end
  end
end
