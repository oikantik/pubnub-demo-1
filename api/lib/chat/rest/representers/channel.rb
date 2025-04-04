# frozen_string_literal: true

require 'roar/decorator'
require 'roar/json'

module Chat
  module REST
    module Representers
      class Channel < Roar::Decorator
        include Roar::JSON

        property :id
        property :name
        property :description
        property :created_by
        property :created_at
        property :updated_at

        # Add user list when needed
        collection :members, exec_context: :decorator, if: ->(_) { exec_context.include_members? }

        def include_members?
          options[:include_members] || false
        end

        def members
          return [] unless include_members?

          member_ids = represented.member_ids || []
          return [] if member_ids.empty?

          users = Chat::Models::User.where(id: member_ids).all
          users.map do |user|
            Chat::REST::Representers::User.new(user).to_hash
          end
        end
      end
    end
  end
end
