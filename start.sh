#!/bin/bash
ulimit -n 200000
CHOKIDAR_USEPOLLING=1 EXPO_NO_DOTENV=1 npx expo start --tunnel --no-dev --clear
