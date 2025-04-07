#! /bin/bash

bundle install

bundle exec rake db:migrate

bundle exec guard --group server start --no-interactions
