#!/bin/sh
set -eu
mkdir -p /reports
node --test --test-reporter=junit --test-reporter-destination=/reports/junit.xml tests/*.test.js
