# frozen_string_literal: true

require 'roar/decorator'
require 'roar/json'
require_relative 'base'

module Chat
  module REST
    module Representers
      class Success < Base
        property :success, exec_context: :decorator
        property :message, exec_context: :decorator, if: ->(_) { self.message? }

        def success
          true
        end

        def message
          options[:message]
        end

        def message?
          !options[:message].nil?
        end
      end
    end
  end
end
