# frozen_string_literal: true

module Chat
  # Make Redis and DB accessible from the chat module
  REDIS = ::REDIS
  DB = ::DB
end
