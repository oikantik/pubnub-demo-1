# frozen_string_literal: true

require 'roar/decorator'
require 'roar/json'

module Chat
  module REST
    module Representers
      # Base class for all representers
      # Provides common functionality for handling options
      class Base < Roar::Decorator
        include Roar::JSON

        attr_accessor :options

        def initialize(represented)
          super
          @options = {}
        end

        # Class method to create and prepare a decorator
        def self.prepare(represented)
          new(represented)
        end
      end
    end
  end
end
