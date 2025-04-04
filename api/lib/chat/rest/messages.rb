# frozen_string_literal: true

require 'grape'
require 'chat/services/pubnub'
require 'chat/models/message'
require 'securerandom'

module Chat::REST
  class Messages < Grape::API
    format :json

    @pubnub_service = Chat::Services::PubnubService.new

    class << self
      attr_reader :pubnub_service
    end

    resource :messages do
      desc 'Send a message to a channel'
      params do
        requires :channel, type: String, desc: 'Channel to publish to'
        requires :message, type: String, desc: 'Message content'
        optional :sender, type: String, desc: 'Message sender'
      end
      post do
        sender = params[:sender] || 'anonymous'

        message = Chat::Models::Message.new(
          message: params[:message],
          sender: sender,
          channel: params[:channel]
        )

        Messages.pubnub_service.publish(params[:channel], message.to_h)

        { success: true, message: message.to_h }
      end

      desc 'Get history of a channel (mock - would use PubNub history in production)'
      params do
        requires :channel, type: String, desc: 'Channel to get history from'
      end
      get ':channel/history' do
        # In a real application, you would use PubNub's history API
        # This is just a mock that returns a dummy message
        [
          Chat::Models::Message.new(
            message: 'Welcome to the chat!',
            sender: 'system',
            channel: params[:channel],
            timestamp: Time.now.to_i - 3600
          ).to_h
        ]
      end
    end
  end
end
