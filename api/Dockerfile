FROM ruby:3.2-alpine

WORKDIR /app

RUN apk add --no-cache build-base postgresql-dev postgresql-client bash

COPY Gemfile Gemfile.lock ./
RUN bundle install

COPY . .

EXPOSE 9292

# Add wait-for-it script to wait for PostgreSQL
ADD https://raw.githubusercontent.com/vishnubob/wait-for-it/master/wait-for-it.sh /usr/bin/wait-for-it
RUN chmod +x /usr/bin/wait-for-it

# Run database migrations and start the server
CMD ["sh", "-c", "wait-for-it postgres:5432 -t 60 && wait-for-it redis:6379 -t 60 && bundle exec rake db:migrate && bundle exec rackup --host 0.0.0.0 -p 9292"] 