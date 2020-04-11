# mattermost-lti
A dockerized Mattermost instance that can be embedded in a LTI platform, such as Moodle.
![](https://user-images.githubusercontent.com/1503861/79054796-3f513e80-7c48-11ea-9749-2b00f46c84e1.png)

:warning: Still work in progress! Use with caution! :warning:

If you are thinking of deploying this yourself, maybe just contact me first :sweat_smile:

## Getting Started
### Add Moodle Activity
 1. Head to your course and `Add an activity or resource`
 1. Choose `External tool`
 1. Set the name of your activity (e.g., `Mattermost`)
 1. Press the + icon next to `Preconfigured tool`, to configure the external tool
 1. Configure the tool as follows:
   * Tool name: `Mattermost`
   * Tool URL: `https://mattermost-lti.example.com/app`
   * LTI version: `LTI 1.3`
   * Initiate login URL: `https://mattermost-lti.example.com/login`
   * Redirection URI(s): `https://mattermost-lti.example.com/app`
   * Privacy -> Share launcher's name with tool: `Always`
   * Privacy -> Share launcher's email with tool: `Always`
   * Privacy -> Accept grades from the tool: `Never`
   * Privacy -> [x] Force SSL
 1. `Save changes`
 1. Press the cogs icon next to `Preconfigured tool`, to retrieve the Client ID of your external tool
 1. `Cancel` the external tool configuration dialog and `save and display` your activity
 1. Retrieve the activity ID from the navigation bar of your browser (e.g., `https://moodle.example.com/mod/lti/view.php?id=ACTIVITY_ID&forceview=1`)

### Configure Mattermost-LTI Bridge
 1. Adjust the `PLATFORMS` variable in `.env` to match your tool's Client ID and your activity ID: `PLATFORMS=ACTIVITY_ID|CLIENT_ID` (multiple activities can be separated by colons)
 1. Adjust `OAUTH_ID` and `OAUTH_TOKEN` in `.env` and `volumes/app/mattermost/config/config.json` (values must match)
 1. Create mandatory directories for Mattermost
    ```sh
    mkdir -p ./volumes/app/mattermost/{data,logs,config}
    cp mattermost-config.json volumes/app/mattermost/config/config.json
    chown -R 2000:2000 ./volumes/app/mattermost/
    ```
 1. Start docker-compose stack
    ```sh
    docker-compose up -d
    ```
 1. Create a Mattermost system administrator and generate access token
    ```sh
    docker exec -e USER=root -e MAIL=root@example.com -e PASS=CHANGEME mattermost-lti_app_1 /create-access-token.sh
    ```
 1. Set `MATTERMOST_TOKEN` in `.env` to the token created in the last step
 1  Completely restart the docker-compose stack
    ```sh
    docker-compose down
    docker-compose up -d
    ```
 1. Retrieve LTI public key
    ```sh
    docker logs mattermost-lti_mattermost-lti_1
    ```

### Finish Moodle External Tool Configuration
 1. Head back to your activity and press the cogs icon to open the external tool configuration dialog
 1. Add the public key of the LTI bridge
 1. Optionally set a proper tool icon, by clicking "Show more..." and setting both Icon URL and Secure icon URL to `https://mattermost-lti.example.com/static/images/favicon/apple-touch-icon-60x60.png`
 1. `Save changes`
 1. `Save and display`
