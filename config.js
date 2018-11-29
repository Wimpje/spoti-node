var convict = require('convict');
 
// Define a schema
var config = convict({
  env: {
    doc: "The application environment.",
    format: ["production", "development", "test"],
    default: "development",
    env: "NODE_ENV"
  },
  spotifyClientSecret: {
    doc: "The Spotify API secret.",
   format: String,
   default: "",   
    env: "CLIENT_SECRET",
    arg: "clientSecret"
  },
  spotifyClientID: {
    doc: "The port to bind.",
    format: String,
   default: "", 
    env: "CLIENT_ID",
    arg: "clientId"
  }
})

var env = config.get('env');
config.loadFile('./config/' + env + '.json');
 
// Perform validation
config.validate({allowed: 'strict'});
 
module.exports = config;