# frozen_string_literal: true

require 'roar/decorator'
require 'roar/json'
require_relative 'base'

module Chat
  module REST
    module Representers
      class Channel < Base
        property :id
        property :name
        property :description
        property :created_by
        property :created_at
        property :updated_at

        # Add user list when needed
        collection :members, exec_context: :decorator, if: ->(_) { self.include_members? }

        def include_members?
          options[:include_members] || false
        end

        def members
          return [] unless include_members?

          represented.users.map do |user|
            Chat::REST::Representers::User.new(user).to_hash
          end
        end
      end
    end
  end
end
