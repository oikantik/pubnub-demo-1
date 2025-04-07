FROM ruby:3.2-alpine

WORKDIR /app

RUN apk add --no-cache build-base postgresql-dev postgresql-client bash curl jq

COPY Gemfile Gemfile.lock ./
RUN bundle install

COPY . .

EXPOSE 9292

# Start the server
CMD ["bundle", "exec", "rackup", "--host", "0.0.0.0", "-p", "9292"] 