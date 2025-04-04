BASE_PATH = File.dirname(File.absolute_path(__FILE__))
$: << BASE_PATH + "/lib"

require 'redis'
require 'sequel'
require 'securerandom'
require 'json'
require 'roar/json'
require 'grape-swagger'

# Setup Redis client
REDIS = Redis.new(url: ENV['REDIS_URL'])

# Setup Sequel and connect to the database
DB = Sequel.connect(
  adapter: 'postgres',
  host: ENV['POSTGRES_HOST'],
  port: ENV['POSTGRES_PORT'],
  user: ENV['POSTGRES_USER'],
  password: ENV['POSTGRES_PASSWORD'],
  database: ENV['POSTGRES_DB']
)

# Load main module which will load all components
require 'chat'

# Load models first
require 'chat/models/user'
require 'chat/models/channel'
require 'chat/models/message'

# Then services
require 'chat/services/redis'
require 'chat/services/pubnub'

# Then operations
require 'chat/services/operations/user'
require 'chat/services/operations/channel'
require 'chat/services/operations/message'

# Then representers
require 'chat/rest/representers/user'
require 'chat/rest/representers/channel'
require 'chat/rest/representers/message'

# Finally REST endpoints
require 'chat/rest'
require 'chat/rest/ping'
require 'chat/rest/users'
require 'chat/rest/channels'
require 'chat/rest/messages'
require 'chat/rest/tokens'
