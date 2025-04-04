# PubNub Token Refresh Implementation

When using PubNub Access Manager (PAM), tokens have a limited lifetime specified by the `ttl` parameter. Implementing a robust token refresh strategy is crucial for maintaining uninterrupted service for your users.

## Token Lifecycle

1. **Token Creation**: The server generates a token with specified permissions and TTL
2. **Token Usage**: The client uses the token for PubNub operations
3. **Token Expiration**: The token becomes invalid after its TTL expires
4. **Token Refresh**: A new token must be obtained before the current one expires

## Recommended Refresh Strategy

The best practice is to refresh tokens *before* they expire to avoid service interruptions. A good approach is to refresh when the token reaches 80-90% of its lifetime.

## Server-Side Implementation

First, implement token generation on your server:

```ruby
# api/lib/chat/services/pubnub.rb

module Chat
  module Services
    class Pubnub
      # Default token TTL in seconds (24 hours)
      DEFAULT_TTL = 86400
      
      # Generate a token for a user
      def generate_token(user_id, force_refresh = false)
        # Check cache unless forcing refresh
        unless force_refresh
          cached_token = Chat::Services::Redis.get_pubnub_token(user_id)
          return cached_token if cached_token
        end
        
        # Get user object
        user = Chat::Models::User[user_id]
        return nil unless user
        
        # Get resources for token
        resources = token_resources_for_user(user)
        
        # Request token from PubNub
        token_request = admin_client.grant_token(
          ttl: DEFAULT_TTL,
          resources: resources,
          authorized_uuid: user_id.to_s,
          http_sync: true
        )
        
        # Process result
        result = token_request.result
        
        if result && result[:token]
          # Store token with TTL
          Chat::Services::Redis.set_pubnub_token(user_id, result[:token], DEFAULT_TTL)
          # Also store user-token mapping
          Chat::Services::Redis.set_user_token(result[:token], user.id, DEFAULT_TTL)
          result[:token]
        else
          puts "Error generating token: #{token_request.status[:error]}"
          nil
        end
      end
      
      # Revoke a token
      def revoke_token(token)
        # Get user id from token
        user_id = Chat::Services::Redis.get_user_from_token(token)
        return false unless user_id
        
        # Remove from Redis
        Chat::Services::Redis.delete("auth:#{token}")
        Chat::Services::Redis.delete("pubnub:#{user_id}")
        
        true
      end
    end
  end
end
```

Then, add a token refresh endpoint to your API:

```ruby
# api/lib/chat/rest/tokens.rb

module Chat::REST
  class Tokens < Grape::API
    helpers Chat::REST::Helpers
    
    format :json
    version 'v1', using: :path
    
    resource :tokens do
      before do
        authenticate!
      end
      
      desc 'Generate a new PubNub access token'
      post :pubnub do
        # Force new token generation
        token = Chat::Services::Pubnub.instance.generate_token(current_user.id, true)
        error!('Failed to generate token', 500) unless token
        
        present_with(Object.new, Chat::REST::Representers::Token, token: token)
      end
      
      desc 'Refresh PubNub access token'
      put :refresh do
        # Generate new token
        token = Chat::Services::Pubnub.instance.generate_token(current_user.id, true)
        error!('Failed to refresh token', 500) unless token
        
        present_with(Object.new, Chat::REST::Representers::Token, token: token)
      end
      
      desc 'Revoke PubNub access token'
      delete :revoke do
        # Get current token from header
        token = request.headers['Authorization']&.split(' ')&.last
        return error!('No token provided', 400) unless token
        
        # Revoke token
        success = Chat::Services::Pubnub.instance.revoke_token(token)
        error!('Failed to revoke token', 500) unless success
        
        present_with(Object.new, Chat::REST::Representers::Success, message: 'Token revoked')
      end
    end
  end
end
```

## Client-Side Implementation

### Token Refresh Logic

Implement token refresh on the client side to request a new token before the current one expires:

```javascript
// frontend/src/services/pubnub.js

class PubNubService {
  constructor() {
    this.pubnub = null;
    this.token = null;
    this.tokenExpiryTime = null;
    this.refreshTimer = null;
  }
  
  // Initialize PubNub with token
  initialize(token, userId) {
    this.token = token;
    this.tokenExpiryTime = this.calculateExpiryTime(token);
    
    // Initialize PubNub
    this.pubnub = new PubNub({
      subscribeKey: import.meta.env.VITE_PUBNUB_SUBSCRIBE_KEY,
      publishKey: import.meta.env.VITE_PUBNUB_PUBLISH_KEY,
      userId: userId,
      authKey: token
    });
    
    // Schedule token refresh
    this.scheduleTokenRefresh();
    
    return this.pubnub;
  }
  
  // Calculate token expiry time
  calculateExpiryTime(token) {
    try {
      // Decode the token (simplified - actual implementation depends on token format)
      // In practice, you may need to use the PubNub SDK's parse_token method
      // or get the expiry information from your server
      const tokenData = JSON.parse(atob(token.split('.')[1]));
      return tokenData.exp * 1000; // Convert to milliseconds
    } catch (e) {
      // If we can't parse, assume 24 hours from now
      return Date.now() + 24 * 60 * 60 * 1000;
    }
  }
  
  // Schedule token refresh
  scheduleTokenRefresh() {
    // Clear any existing timer
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }
    
    if (!this.tokenExpiryTime) return;
    
    // Calculate time to refresh (80% of token lifetime)
    const now = Date.now();
    const expiresIn = this.tokenExpiryTime - now;
    const refreshIn = expiresIn * 0.8;
    
    console.log(`Token expires in ${expiresIn/1000} seconds. Will refresh in ${refreshIn/1000} seconds.`);
    
    // Schedule refresh
    this.refreshTimer = setTimeout(() => this.refreshToken(), refreshIn);
  }
  
  // Refresh the token
  async refreshToken() {
    try {
      // Call API to get new token
      const response = await fetch('/api/v1/tokens/refresh', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to refresh token');
      }
      
      const data = await response.json();
      const newToken = data.token;
      
      // Update token
      this.token = newToken;
      this.tokenExpiryTime = this.calculateExpiryTime(newToken);
      
      // Update PubNub configuration
      this.pubnub.setAuthKey(newToken);
      
      // Schedule next refresh
      this.scheduleTokenRefresh();
      
      console.log('Token refreshed successfully');
    } catch (error) {
      console.error('Error refreshing token:', error);
      
      // Schedule retry in 1 minute
      setTimeout(() => this.refreshToken(), 60000);
    }
  }
  
  // Handle 403 errors (token expired/invalid)
  async handle403Error() {
    try {
      // Force immediate token refresh
      await this.refreshToken();
      
      // Return true to indicate successful refresh
      return true;
    } catch (error) {
      console.error('Error handling 403:', error);
      return false;
    }
  }
}

export default new PubNubService();
```

### Handling 403 Errors

When a token expires, PubNub will return 403 errors. Implement error handling:

```javascript
// Add listener for status events
pubnub.addListener({
  status: (event) => {
    if (event.category === 'PNAccessDeniedCategory') {
      console.log('Access denied - token may have expired');
      
      // Refresh token and reconnect
      pubNubService.handle403Error().then(success => {
        if (success) {
          console.log('Reconnecting after token refresh');
          pubnub.reconnect();
        } else {
          console.error('Could not refresh token, redirecting to login');
          // Redirect to login page
          window.location.href = '/login';
        }
      });
    }
  }
});
```

## Best Practices

1. **Set Appropriate TTL**: Balance security (shorter TTL) with user experience (fewer refreshes)
2. **Refresh Before Expiry**: Aim to refresh at 80-90% of the token's lifetime
3. **Handle Failures Gracefully**: Implement retry logic with backoff
4. **Secure Token Storage**: Store tokens securely (HTTP-only cookies, secure storage)
5. **Monitor Token Usage**: Log token creation and refresh events for debugging

## Testing Token Refresh

To test your token refresh implementation:

1. Set a short TTL (e.g., 5 minutes) for testing
2. Monitor token refresh in your application logs
3. Verify that refreshes occur before expiration
4. Simulate token expiration by manipulating the token expiry time
5. Test error handling by deliberately causing refresh failures

By implementing a robust token refresh strategy, you ensure that your users maintain uninterrupted access to your chat application's features while maintaining the security benefits of short-lived access tokens. 