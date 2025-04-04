1. Add presence
2. When a new user is created, he can join a channel or create one.
3. Creating a channel has to be done through backend. Not frontend.
4. TTL

1. Presence tracking is supp
2. In redis store the grant token with ttl same as assigned.
3. Add a ew endpoint for grant token
4. Grant access to channels

When user creates a channel, it gives him access to that channel in pubnub as well

When user joins a channel, it gives him access to that channel as well.

We should have a grant access to channels, so it can take an array, cause it should give them access to channels

Admin should be able to do something in pubnub right? Yes, admin is the one who gives access to that channel, but then what does client do?

The client probably is just for the grant token?

How does pubnub work?

When the app boots up, give them access to proper channels