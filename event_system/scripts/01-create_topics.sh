#!/bin/bash

script_filename=$(readlink -f "$0")
WORKING_DIR=$(dirname "$script_filename")

source $WORKING_DIR/shell_colors.sh

echo -e "\n${yellow}Attempting to create Topic positioning...${reset}"

docker exec -it game_kafka1 sh -c "/usr/bin/kafka-topics --create --zookeeper localhost:22181 --replication-factor 1 --partitions 1 --topic positioning"