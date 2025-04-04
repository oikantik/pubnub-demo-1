# frozen_string_literal: true
require_relative 'boot'
require 'chat/rest'
require 'rack/cors'

use Rack::Cors do
  allow do
    origins ENV['CORS_ORIGINS'] || '*'
    resource '*',
      headers: :any,
      methods: [:get, :post, :delete, :put, :patch, :options, :head]
  end
end

run Chat::REST::Root
