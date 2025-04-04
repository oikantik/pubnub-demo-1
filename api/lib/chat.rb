# frozen_string_literal: true

module Chat
  # Make Redis and DB accessible from the chat module
  REDIS = ::REDIS
  DB = ::DB
end

# Load models
require 'chat/models/user'
require 'chat/models/channel'
require 'chat/models/message'

# Load services
require 'chat/services/redis'
require 'chat/services/pubnub'
require 'chat/services/user'
require 'chat/services/channel'
require 'chat/services/message'

# Load representers
require 'chat/rest/representers/user'
require 'chat/rest/representers/channel'
require 'chat/rest/representers/message'
require 'chat/rest/representers/success'
require 'chat/rest/representers/token'

# Load REST API
require 'chat/rest'
