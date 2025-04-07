# frozen_string_literal: true

require 'roar/decorator'
require 'roar/json'
require_relative 'base'

module Chat
  module REST
    module Representers
      # Success representer for API responses
      # Used to format success responses with optional messages
      class Success < Base
        # Always true for success responses
        property :success, exec_context: :decorator
        # Optional message explaining the success
        property :message, exec_context: :decorator, if: ->(_) { self.message? }

        # Get the success value (always true)
        #
        # @return [Boolean] Always returns true
        def success
          true
        end

        # Get the optional message
        #
        # @return [String, nil] The success message or nil
        def message
          options[:message]
        end

        # Check if a message is present
        #
        # @return [Boolean] True if a message was provided
        def message?
          !options[:message].nil?
        end
      end
    end
  end
end
