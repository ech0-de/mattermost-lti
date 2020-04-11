# mattermost-lti
A dockerized Mattermost instance that can be embedded in a LTI platform, such as Moodle.

:warning: Still work in progress! Use with caution! :warning:

## Getting started
```sh
mkdir -p ./volumes/app/mattermost/{data,logs,config}
cp mattermost-config.json volumes/app/mattermost/config/config.json
chown -R 2000:2000 ./volumes/app/mattermost/
```
