# frozen_string_literal: true

require 'roar/decorator'
require 'roar/json'
require_relative 'base'

module Chat
  module REST
    module Representers
      # Representer for PubNub authentication tokens
      # Used to format token responses for the API
      class Token < Base
        # @!attribute [r] token
        #   @return [String] The PubNub authentication token
        property :token, exec_context: :decorator

        # Get token from options
        # @return [String] The token string
        def token
          options[:token]
        end
      end
    end
  end
end
