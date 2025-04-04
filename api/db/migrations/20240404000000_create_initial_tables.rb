# frozen_string_literal: true
Sequel.migration do
  up do
    # Create UUID extension
    run 'CREATE EXTENSION IF NOT EXISTS "uuid-ossp"'

    create_table(:users) do
      uuid :id, primary_key: true, default: Sequel.function(:uuid_generate_v4)
      String :name, null: false, unique: true
      DateTime :created_at, null: false, default: Sequel.function(:now)
      DateTime :updated_at, null: false, default: Sequel.function(:now)
    end

    create_table(:channels) do
      uuid :id, primary_key: true, default: Sequel.function(:uuid_generate_v4)
      String :name, null: false, unique: true
      Text :description
      uuid :created_by, null: false
      foreign_key [:created_by], :users
      DateTime :created_at, null: false, default: Sequel.function(:now)
      DateTime :updated_at, null: false, default: Sequel.function(:now)
    end

    create_table(:user_channels) do
      primary_key [:user_id, :channel_id]
      uuid :user_id, null: false
      uuid :channel_id, null: false
      foreign_key [:user_id], :users
      foreign_key [:channel_id], :channels, on_delete: :cascade
      DateTime :joined_at, null: false, default: Sequel.function(:now)
    end

    create_table(:messages) do
      uuid :id, primary_key: true, default: Sequel.function(:uuid_generate_v4)
      Text :text, null: false
      uuid :sender_id, null: false
      uuid :channel_id, null: false
      foreign_key [:sender_id], :users
      foreign_key [:channel_id], :channels, on_delete: :cascade
      Integer :timestamp, null: false
      DateTime :created_at, null: false, default: Sequel.function(:now)
      DateTime :updated_at, null: false, default: Sequel.function(:now)
    end

    # Add indexes
    add_index :users, :name
    add_index :channels, :name
    add_index :messages, :channel_id
    add_index :messages, :sender_id
    add_index :messages, :timestamp
    add_index :user_channels, :user_id
    add_index :user_channels, :channel_id
  end

  down do
    drop_table(:messages)
    drop_table(:user_channels)
    drop_table(:channels)
    drop_table(:users)
  end
end
