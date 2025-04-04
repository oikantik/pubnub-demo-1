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

# Run migrations before loading models
Sequel.extension :migration
Sequel::Migrator.run(DB, File.join(BASE_PATH, 'db', 'migrations'))

# Load the main Chat module which includes all components
require 'chat'

# We're not loading models or other components here
# They will be loaded after migrations in the application startup
