#!/bin/bash
# API Test Script

# API host configuration
API_HOST=${API_HOST:-http://localhost:9292}

# Check for jq or set pretty flag to empty if not available
if command -v jq &> /dev/null; then
  USE_JQ=true
else
  echo "Warning: jq not found, output won't be pretty-printed"
  USE_JQ=false
fi

# Helper function to execute curl and format output if jq is available
function curl_and_format() {
  if $USE_JQ; then
    curl -s "$@" | jq
  else
    curl -s "$@"
  fi
}

# Helper function to extract value from JSON without jq
function extract_from_json() {
  local json="$1"
  local key="$2"
  if $USE_JQ; then
    echo "$json" | jq -r ".$key"
  else
    # Basic parsing without jq (this is a simplistic approach and not robust)
    echo "$json" | grep -o "\"$key\":\"[^\"]*\"" | sed -e "s/\"$key\":\"//" -e "s/\"$//"
  fi
}

# Step 1: Check if API is up with ping endpoint
echo -e "\n== Testing API Ping =="
PING_RESULT=$(curl -s "$API_HOST/v1/ping")
if $USE_JQ; then
  echo "$PING_RESULT" | jq
else
  echo "$PING_RESULT"
fi

if [[ "$PING_RESULT" != *"pong"* ]]; then
  echo "API is not accessible"
  exit 1
fi

# Step 2: Create/login a test user
echo -e "\n== Creating Test User =="
LOGIN_RESULT=$(curl -s -X POST -H "Content-Type: application/json" -d '{"name":"testuser"}' "$API_HOST/v1/users/login")
if $USE_JQ; then
  echo "$LOGIN_RESULT" | jq
else
  echo "$LOGIN_RESULT"
fi

# Extract the auth token from the response
TOKEN=$(extract_from_json "$LOGIN_RESULT" "token")
if [[ -z "$TOKEN" ]]; then
  echo "Failed to get authentication token!"
  exit 1
fi

# Step 3: Get user info with the token
echo -e "\n== Getting User Info =="
curl_and_format -H "Authorization: Bearer $TOKEN" "$API_HOST/v1/users/me"

# Step 4: Create a channel
echo -e "\n== Creating Channel =="
CHANNEL_RESULT=$(curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"name":"test-channel-'$(date +%s)'"}' "$API_HOST/v1/channels")
if $USE_JQ; then
  echo "$CHANNEL_RESULT" | jq
else
  echo "$CHANNEL_RESULT"
fi

# Extract channel ID
CHANNEL_ID=$(extract_from_json "$CHANNEL_RESULT" "id")
if [[ -z "$CHANNEL_ID" ]]; then
  echo "Failed to create channel!"
  exit 1
fi

# Step 5: List all channels
echo -e "\n== Listing All Channels =="
curl_and_format -H "Authorization: Bearer $TOKEN" "$API_HOST/v1/channels"

# Step 6: Send a message to the channel
echo -e "\n== Sending Message =="
curl_and_format -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"channel_id":"'$CHANNEL_ID'","text":"Automated test message"}' "$API_HOST/v1/messages"

# Step 7: Get message history
echo -e "\n== Getting Message History =="
curl_and_format -H "Authorization: Bearer $TOKEN" "$API_HOST/v1/channels/$CHANNEL_ID/history"

# Step 8: Check presence
echo -e "\n== Checking Presence =="
curl_and_format -H "Authorization: Bearer $TOKEN" "$API_HOST/v1/channels/$CHANNEL_ID/presence"

# Step 9: Generate PubNub token
echo -e "\n== Generating PubNub Token =="
curl_and_format -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{}' "$API_HOST/v1/tokens/pubnub"

# Step 10: Logout
echo -e "\n== Logging Out =="
curl_and_format -X DELETE -H "Authorization: Bearer $TOKEN" "$API_HOST/v1/users/logout"

echo -e "\n== API Test Complete =="
