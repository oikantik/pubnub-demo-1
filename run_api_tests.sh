#!/bin/bash
# Script to run API tests in Docker

echo "Running API tests in Docker container..."

# First check if the container is running
CONTAINER_STATUS=$(docker ps -q -f name=pubnub-demo-api-1)

if [ -z "$CONTAINER_STATUS" ]; then
  # Container is not running, start the services
  echo "Starting Docker services..."
  docker compose up -d
  
  # Wait a bit for services to be ready
  echo "Waiting for services to be ready..."
  sleep 10
else
  echo "Docker services are already running."
fi

# Run the tests inside the container
echo "Executing tests in container..."
docker exec pubnub-demo-api-1 bundle exec rake test:api

if [ $? -eq 0 ]; then
  echo "Docker API tests completed successfully!"
  exit 0
else
  echo "Docker API tests failed!"
  exit 1
fi
