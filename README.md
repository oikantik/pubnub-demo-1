# PubNub Chat Demo

A real-time chat application with Ruby Grape API backend and React frontend, using PubNub for real-time messaging.

## Project Structure

- **API**: Ruby Grape API in the `api` directory
- **Frontend**: React with Vite in the `frontend` directory
- **PubNub**: Real-time messaging integrated in both frontend and backend

## Docker Setup

This project is containerized using Docker and can be run using Docker Compose.

### Prerequisites

- Docker installed on your machine
- Docker Compose installed on your machine
- PubNub account with publish, subscribe, and secret keys (free tier available)

### Configuration

1. Replace the PubNub keys in the `docker-compose.yml` file:
   ```yaml
   environment:
     - PUBNUB_SUBSCRIBE_KEY=sub-c-your-subscribe-key
     - PUBNUB_PUBLISH_KEY=pub-c-your-publish-key
     - PUBNUB_SECRET_KEY=sec-c-your-secret-key
   ```

### Running the Application

1. Clone this repository
2. Navigate to the project root
3. Build the Docker containers:
   ```
   docker compose build
   ```
4. Start the Docker containers:
   ```
   docker compose up -d
   ```
5. The services will be available at:
   - API: http://localhost:9292
   - Frontend: http://localhost:5173

### Testing the API

You can test the API with:

```
curl http://localhost:9292/ping
```

This should return:
```json
{"message":"pong"}
```

To send a message via the API:
```
curl -X POST http://localhost:9292/messages \
  -H "Content-Type: application/json" \
  -d '{"channel":"demo-channel", "message":"Hello from curl", "sender":"curl-user"}'
```

### Stopping the Application

To stop the application:

```
docker compose down
```