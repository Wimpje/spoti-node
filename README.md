# spoti-node
Electron with which to interact with spotify connect devices without desktop / mobile app.

I've mainly built this because my spotify desktop app didn't work and wanted to get my keyboard hotkeys working again when I was playing music via spotify connect...

In the meantime I learned about electron and the spotify API, pretty nice :)

Storing it here since it might be useful to see how you can authorize an electron app with Spotify. 

This is very much WIP and trying out how Electron / Spotify API work, I might make this nicer in future though :)

# getting started
* Install NodeJS / NPM etc.
* Clone the repo
* Run `npm install`
* Create Spotify app secret/id, see: https://developer.spotify.com/dashboard/applications, for more info: https://developer.spotify.com/documentation/general/guides/app-settings/
* Set ENV variables (or add a development.json to /config folder) for Spotify API app secret/id
  * CLIENT_SECRET
  * CLIENT_ID
* Run `npm start`
* On first start you have to authorize the app to access your spotify account. It will pop up a little browser window where you can click 'OK' (or not, but then you can't do much)


# currently supports (in _very_ basic way)
* authentication with Spotify API
* play/pause
* forward/next
* volume
* hooks keyboard mediakeys for ^^
* toast-notifications on play/pause
* now playing / status
* choose spotify-connect-device where to play your music

