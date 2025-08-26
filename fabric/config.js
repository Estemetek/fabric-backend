const fs = require('fs');
const path = require('path');

require('dotenv').config();

function readFile(p) {
  return fs.readFileSync(path.resolve(p));
}

module.exports = {
  mspId: process.env.MSP_ID || 'Org1MSP',
  channelName: process.env.CHANNEL_NAME || 'mychannel',
  chaincodeName: process.env.CHAINCODE_NAME || 'basic',
  peerEndpoint: process.env.PEER_ENDPOINT || 'localhost:7051',
  peerHostAlias: process.env.PEER_HOST_ALIAS || 'peer0.org1.example.com',
  tlsRootCert: readFile(process.env.PEER_TLS_CERT || './certs/peer-tls-root-cert.pem'),
  userCert: readFile(process.env.USER_CERT || './certs/user-cert.pem'),
  userKey: readFile(process.env.USER_KEY || './certs/user-key.pem'),
};
