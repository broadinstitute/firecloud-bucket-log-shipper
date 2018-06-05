const gcs = require('@google-cloud/storage');
const request = require('request-promise-native');

// we will read the logit api key out of a protected bucket. The api key is stored
// in the metadata of the target file; this makes it easy to query (as opposed
// to downloading the whole file for reading)
const storage = new gcs();
let logitApiKey = null;
let userLookupTable = null;

// this generates lots of http requests to logit. Make sure we use a persistent connection
// so we don't create a new http connection each time.
const persistentRequest = request.defaults({
    forever: true
});

const logitUri = "https://api.logit.io/v2";
const logitMethod = "POST";
const logitType = "BucketAudit";

/* reads the logit api key from a known/hardcoded location. We protect the api key
   by applying ACLs to the bucket/file.
 */
function getApiKey(callback, event) {
  // console.log("api key lookup in progress");
  storage
    .bucket("secret-storage")
    .file("dev-logit.json")
    .getMetadata()
    .then(results => {
      const metadata = results[0];
      const apikey = metadata.metadata["Api-Key"]; // yes, it's a nested metadata.metadata
      // console.log("setting api key: " + apikey)
      logitApiKey = apikey;
      return callback(event);
    })
    .catch(err => {
      console.error('ERROR retrieving api key:', err);
      throw err;
    });
}

function getUserLookupTable(callback, event) {
  console.log("user lookup table read in progress");
  storage
    .bucket("secret-storage")
    .file("userLookups.json")
    .download(function(err, contents) {
      if (err != null) {
        console.error(err);
        throw(err);
      } else {
        userLookupTable = JSON.stringify(contents);
        return callback(event);  
      }
    })
}

function shipLog(event) {
  // a final safety check on the api key - possible we attempted to retrieve it but got nothing in return
  if (logitApiKey) {
    const pubsubMessage = event.data;
    if (pubsubMessage.data) {
      const obj = JSON.parse(Buffer.from(pubsubMessage.data, 'base64').toString());
      const timestamp = obj.timestamp
      const principalEmail = obj.protoPayload.authenticationInfo.principalEmail
      // resource and method name would be great to log, but they increase log size (sometimes by 2x or 3x)
      // and we pay by log volume ... so omit them.
      // const resource = obj.protoPayload.resourceName
      // const methodName = obj.protoPayload.methodName

      // extract subjectid from principalEmail      
      let subjectId = "unknown";
      if (principalEmail && principalEmail.startsWith("pet-")) {
        const mailparts = principalEmail.split("@")
        if (mailparts.length == 2) {
          subjectId = mailparts[0].replace("pet-","");
        }
      }

      // if subjectid is still unknown, attempt to look it up in the user table.
      // lazy-load the user table if it isn't already in memory.
      let manualLookup = false;
      if (subjectId === "unknown") {
        if (userLookupTable === null) {
          return getUserLookupTable(shipLog, event);
        } else {
          if (userLookupTable.hasOwnProperty(principalEmail)) {
            manualLookup = true;
            subjectId = userLookupTable[principalEmail];
          }
        }
      }

      const payload = {
        timestamp: timestamp,
        principalEmail: principalEmail,
        // resource and method name would be great to log, but they increase log size (sometimes by 2x or 3x)
        // and we pay by log volume ... so omit them.
        // methodName: methodName,
        // resource: resource,
        subjectId: subjectId,
        manualLookup: manualLookup
      };

      const options = {
        method: logitMethod,
        uri: logitUri,
        headers: {
          "ApiKey": logitApiKey,
          "LogType": logitType
        },
        body: payload,
        json: true
      };

      return persistentRequest(options);
    } else {
      throw new Error("no data found in message");
    }
  } else {
    // no logit api key
    throw new Error("Logit api key is empty. Did we retrieve it correctly?");
  }
}

/**
 * Background Cloud Function triggered by Pub/Sub.
 *
 * @param {object} event The Cloud Functions event.
 */
exports.metricsLogShipper = (event) => {
  // if we don't have the api key initialized yet, go request it and then ship the log once we're inited.
  // if we do have the api key, just ship the log.
  if (logitApiKey == null) {
    return getApiKey(shipLog, event);
  } else {
    return shipLog(event);
  }
};